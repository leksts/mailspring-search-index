const { React, AccountStore } = require('mailspring-exports');
const Indexer = require('./indexer');
const { t, formatNumber, formatBytes } = require('./strings');

const h = React.createElement;

// @electron/remote can't be required from a plugin outside the app bundle, so this uses the
// renderer's own confirm dialog.
function confirmStart(account, state) {
  const title = t('confirmTitle', account.emailAddress);
  const detail = t('confirmDetail', formatNumber(state.remaining), formatBytes(state.estimatedBytes));
  return window.confirm(`${title}\n\n${detail}`);
}

function statusLine(state) {
  switch (state.status) {
    case 'running':
      return t('statusRunning', formatNumber(state.done));
    case 'slow':
      return t('statusSlow', formatNumber(state.done));
    case 'waiting':
      return t('statusWaiting');
    case 'paused':
      return t('statusPaused', formatNumber(state.done));
    case 'done':
      return t('statusDone', formatNumber(state.done));
    case 'error':
      return t('statusError', state.error || '');
    default:
      return null;
  }
}

function AccountRow({ account, state }) {
  const counted = state.remaining !== undefined;
  const nothingLeft = counted && state.remaining === 0;

  let summary = t('counting');
  if (nothingLeft) {
    summary = t('allIndexed');
  } else if (counted) {
    const remaining = t('remaining', formatNumber(state.remaining));
    summary = `${remaining} · ${t('estimate', formatBytes(state.estimatedBytes))}`;
  }

  let button = null;
  if (state.running) {
    button = h(
      'button',
      { className: 'btn', onClick: () => Indexer.pause(account.id) },
      t('pause')
    );
  } else if (counted && !nothingLeft) {
    button = h(
      'button',
      {
        className: 'btn',
        onClick: () => {
          if (state.done > 0 || confirmStart(account, state)) {
            Indexer.start(account.id);
          }
        },
      },
      state.done > 0 ? t('resume') : t('start')
    );
  }

  const status = statusLine(state);
  return h(
    'div',
    { className: 'search-index-account' },
    h(
      'div',
      { className: 'search-index-account-header' },
      h(
        'div',
        { className: 'search-index-account-name' },
        h('strong', null, account.label || account.emailAddress),
        h('div', { className: 'search-index-summary' }, summary)
      ),
      button
    ),
    status ? h('div', { className: 'search-index-status' }, status) : null,
    state.failed > 0
      ? h('div', { className: 'search-index-status' }, t('failed', formatNumber(state.failed)))
      : null
  );
}

class PreferencesSearchIndex extends React.Component {
  static displayName = 'PreferencesSearchIndex';

  componentDidMount() {
    this._unlisteners = [
      Indexer.listen(() => this.forceUpdate()),
      AccountStore.listen(() => Indexer.refreshCounts()),
    ];
    Indexer.refreshCounts();
  }

  componentWillUnmount() {
    this._unlisteners.forEach((unlisten) => unlisten());
  }

  render() {
    const accounts = AccountStore.accounts();
    return h(
      'div',
      { className: 'container-search-index' },
      h('p', { className: 'search-index-intro' }, t('intro')),
      h('p', { className: 'search-index-intro' }, t('diskSpace')),
      h('p', { className: 'search-index-intro' }, t('limits')),
      accounts.length === 0
        ? h('p', { className: 'search-index-intro' }, t('noAccounts'))
        : accounts.map((account) =>
            h(AccountRow, { key: account.id, account, state: Indexer.stateFor(account.id) })
          )
    );
  }
}

module.exports = PreferencesSearchIndex;
