const fs = require('fs');
const path = require('path');
const { Actions, AccountStore, DatabaseStore } = require('mailspring-exports');

// The sync engine only downloads bodies of the last three months, and the search index is
// filled from downloaded bodies. Asking it for older bodies through Actions.fetchBodies (the
// same path as opening a message) indexes them as well. The engine deletes bodies older
// than three months again 14 days after downloading them, but leaves the index alone.

const RUNNING_KEY = 'searchIndex.runningAccountIds';
const BATCH_SIZE = 20;
const POLL_MS = 2000;
const NOTHING_FETCHED_BACKOFF_MS = 5 * 60 * 1000;
const RESUME_DELAY_MS = 60 * 1000;

// The engine fetches requested bodies after interrupting its IDLE connection. On one Outlook
// account that interrupt was seen to have no effect, so requests waited until the server
// ended IDLE itself, about every 28 minutes. A batch is only given up when nothing arrived
// for longer than that, and an account that is slow to start a batch gets bigger batches,
// since the engine works through the whole queue at each wake-up.
const STALL_TIMEOUT_MS = 35 * 60 * 1000;
const SLOW_START_MS = 60 * 1000;
const SLOW_BATCH_SIZE = 250;

// A message the engine has processed a body for always has a snippet, taken from the same
// text that goes into the index, even after the body itself has been deleted again. Messages
// in spam and trash are left out, as the engine does for its own body downloads.
const UNINDEXED = `
  FROM Message m
  WHERE m.accountId = ? AND m.draft = 0
    AND COALESCE(json_extract(m.data, '$.snippet'), '') = ''
    AND NOT EXISTS (SELECT 1 FROM MessageBody b WHERE b.id = m.id)
    AND EXISTS (
      SELECT 1 FROM MessageFolder mf JOIN Folder f ON f.id = mf.folderId
      WHERE mf.messageId = m.id AND mf.remoteUID > 0
        AND COALESCE(f.role, '') NOT IN ('spam', 'trash')
    )`;

const LOG_PATH = path.join(AppEnv.getConfigDirPath(), 'search-index.log');
const LOG_MAX_BYTES = 1024 * 1024;

/**
 * Appends to search-index.log next to config.json, so a run can be followed after the fact.
 * At 1 MB the log moves to search-index.log.old, replacing the previous one.
 */
function log(message) {
  try {
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > LOG_MAX_BYTES) {
      fs.renameSync(LOG_PATH, `${LOG_PATH}.old`);
    }
    fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${message}\n`);
  } catch (err) {
    console.warn('search-index: could not write log', err);
  }
}

function sleep(ms, run) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (run.stop || Date.now() - started >= ms) {
        resolve();
      } else {
        setTimeout(tick, Math.min(POLL_MS, ms));
      }
    };
    tick();
  });
}

class Indexer {
  constructor() {
    this._listeners = new Set();
    this._runs = {};
    this._remaining = {};
    this._averageBodyBytes = 0;
  }

  listen(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _trigger() {
    for (const callback of this._listeners) {
      callback();
    }
  }

  runningAccountIds() {
    const stored = AppEnv.config.get(RUNNING_KEY);
    return Array.isArray(stored) ? stored : [];
  }

  _setRunning(accountId, running, reason) {
    const before = this.runningAccountIds();
    const others = before.filter((id) => id !== accountId);
    const after = running ? [...others, accountId] : others;
    AppEnv.config.set(RUNNING_KEY, after);
    log(`running ${accountId}=${running} (${reason}): [${before}] -> [${this.runningAccountIds()}]`);
  }

  /** What the preferences tab shows for one account. */
  stateFor(accountId) {
    const run = this._runs[accountId];
    return {
      running: this.runningAccountIds().includes(accountId),
      status: run ? run.status : 'idle',
      done: run ? run.done : 0,
      failed: run ? run.failed : 0,
      remaining: this._remaining[accountId],
      estimatedBytes: (this._remaining[accountId] || 0) * this._averageBodyBytes,
    };
  }

  async refreshCounts() {
    const [avg] = await DatabaseStore._query(
      `SELECT AVG(LENGTH(value)) AS bytes FROM MessageBody
       WHERE fetchedAt IS NOT NULL AND LENGTH(value) > 0`,
      [],
      true
    );
    this._averageBodyBytes = (avg && avg.bytes) || 0;
    for (const account of AccountStore.accounts()) {
      await this._refreshRemaining(account.id);
    }
    this._trigger();
  }

  async _refreshRemaining(accountId) {
    const [row] = await DatabaseStore._query(
      `SELECT COUNT(*) AS count ${UNINDEXED}`,
      [accountId],
      true
    );
    this._remaining[accountId] = row ? row.count : 0;
  }

  start(accountId) {
    this._setRunning(accountId, true, 'start button');
    this._loop(accountId);
  }

  pause(accountId) {
    this._setRunning(accountId, false, 'pause button');
    const run = this._runs[accountId];
    if (run) {
      run.stop = true;
    }
    this._trigger();
  }

  /** Picks up runs that were active when Mailspring last quit, once the engine has started. */
  resumeAfterLaunch() {
    log(`activated in window ${AppEnv.getWindowType()}: running=[${this.runningAccountIds()}]`);
    this._resumeTimer = setTimeout(() => {
      const existing = AccountStore.accountIds();
      log(`resume after launch: running=[${this.runningAccountIds()}] accounts=[${existing}]`);
      for (const accountId of this.runningAccountIds()) {
        if (existing.includes(accountId)) {
          this._loop(accountId);
        } else {
          this._setRunning(accountId, false, 'account removed');
        }
      }
    }, RESUME_DELAY_MS);
  }

  stopAll() {
    log('deactivate: stopping all runs');
    clearTimeout(this._resumeTimer);
    for (const run of Object.values(this._runs)) {
      run.stop = true;
    }
  }

  async _loop(accountId) {
    const previous = this._runs[accountId];
    if (previous && previous.active) {
      log(`loop ${accountId}: already active, continuing it`);
      previous.stop = false;
      return;
    }
    const run = {
      active: true,
      stop: false,
      status: 'running',
      done: previous ? previous.done : 0,
      failed: previous ? previous.failed : 0,
      // Messages whose body never arrived (deleted on the server, or an error). They are
      // retried on the next launch, not in an endless loop now.
      skipped: previous ? previous.skipped : new Set(),
      batchSize: previous ? previous.batchSize : BATCH_SIZE,
    };
    this._runs[accountId] = run;
    log(`loop ${accountId}: started (done so far ${run.done})`);
    this._trigger();

    try {
      while (!run.stop && AccountStore.accountForId(accountId)) {
        const ids = await this._nextBatch(accountId, run);
        if (ids.length === 0) {
          run.status = 'done';
          this._setRunning(accountId, false, 'nothing left to index');
          break;
        }

        log(`loop ${accountId}: requesting ${ids.length} bodies (batch size ${run.batchSize})`);
        const requestedAt = Date.now();
        Actions.fetchBodies(ids.map((id) => ({ id, accountId })));
        const fetched = await this._waitForBodies(ids, run);
        log(
          `loop ${accountId}: ${fetched.size}/${ids.length} arrived after ` +
            `${Math.round((Date.now() - requestedAt) / 1000)}s${run.stop ? ' (stopped)' : ''}`
        );
        for (const id of ids) {
          if (!fetched.has(id) && !run.stop) {
            run.skipped.add(id);
            run.failed += 1;
          }
        }
        await this._refreshRemaining(accountId);
        this._trigger();

        // Usually the account is offline or the engine is busy with a first sync.
        if (fetched.size === 0 && !run.stop) {
          run.status = 'waiting';
          this._trigger();
          await sleep(NOTHING_FETCHED_BACKOFF_MS, run);
          run.status = 'running';
        }
      }
    } catch (err) {
      console.error('search-index: indexing stopped', err);
      log(`loop ${accountId}: error ${err.stack || err}`);
      run.status = 'error';
      run.error = err.message;
    } finally {
      log(`loop ${accountId}: ended with status ${run.status}, stop=${run.stop}, done=${run.done}`);
      run.active = false;
      if (['running', 'slow', 'waiting'].includes(run.status)) {
        run.status = 'paused';
      }
      this._trigger();
    }
  }

  async _nextBatch(accountId, run) {
    const rows = await DatabaseStore._query(
      `SELECT m.id AS id ${UNINDEXED} ORDER BY m.date DESC LIMIT ?`,
      [accountId, run.batchSize + run.skipped.size],
      true
    );
    return rows
      .map((r) => r.id)
      .filter((id) => !run.skipped.has(id))
      .slice(0, run.batchSize);
  }

  /**
   * Resolves with the ids whose body the engine has stored, once all arrived or when nothing
   * arrived for STALL_TIMEOUT_MS. Counts progress into run.done as bodies come in.
   */
  async _waitForBodies(ids, run) {
    const placeholders = ids.map(() => '?').join(',');
    const started = Date.now();
    const doneBefore = run.done;
    let lastProgress = started;
    let fetched = new Set();
    while (!run.stop && Date.now() - lastProgress < STALL_TIMEOUT_MS) {
      await sleep(POLL_MS, run);
      const rows = await DatabaseStore._query(
        `SELECT id FROM MessageBody WHERE fetchedAt IS NOT NULL AND id IN (${placeholders})`,
        ids,
        true
      );
      const now = Date.now();
      if (rows.length > fetched.size) {
        if (fetched.size === 0 && now - started > SLOW_START_MS) {
          run.batchSize = SLOW_BATCH_SIZE;
        }
        fetched = new Set(rows.map((r) => r.id));
        lastProgress = now;
        run.done = doneBefore + fetched.size;
        run.status = 'running';
        this._trigger();
      } else if (fetched.size === 0 && now - started > SLOW_START_MS && run.status !== 'slow') {
        run.status = 'slow';
        this._trigger();
      }
      if (fetched.size === ids.length) {
        break;
      }
    }
    return fetched;
  }
}

module.exports = new Indexer();
