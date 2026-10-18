// Mailspring's own translation tables only cover built-in strings, so this plugin carries
// its own. The language follows Preferences > General, falling back to the system locale.
const STRINGS = {
  en: {
    preferencesTab: 'Search Index',
    intro:
      'Mailspring only downloads the text of mail from the last three months, so search does not find words in older messages. Indexing an account downloads the text of all its older mail once and adds it to the local search index.',
    diskSpace:
      'This temporarily uses extra disk space: Mailspring keeps the downloaded text for 14 days and then deletes it again. The search index itself stays, at roughly 5% of the mailbox size.',
    limits:
      'Only the first 5,000 characters of each message are indexed, attachments are not, and spam and trash are skipped.',
    noAccounts: 'You have no accounts yet.',
    counting: 'Counting…',
    allIndexed: 'All mail is searchable.',
    remaining: '%@ messages not yet searchable',
    estimate: 'about %@ temporarily',
    start: 'Index All Mail',
    resume: 'Resume',
    pause: 'Pause',
    statusRunning: 'Indexing… %@ done',
    statusSlow:
      '%@ done. Waiting for the account to fetch messages, which can take up to half an hour.',
    statusWaiting: 'Waiting: no text arrived for 35 minutes. Is the account offline? Trying again in 5 minutes.',
    statusPaused: 'Paused after %@ messages.',
    statusDone: 'Done: %@ messages indexed.',
    statusError: 'Stopped by an error: %@',
    failed: '%@ could not be downloaded and are tried again after a restart.',
    confirmTitle: 'Index all mail of %@?',
    confirmDetail:
      'Mailspring will download the text of %@ older messages. This temporarily uses about %@ of extra disk space, freed again after 14 days. You can pause at any time, and indexing continues after a restart.',
  },
  nl: {
    preferencesTab: 'Zoekindex',
    intro:
      'Mailspring downloadt alleen de tekst van mail uit de laatste drie maanden, dus zoeken vindt geen woorden in oudere berichten. Indexeren downloadt eenmalig de tekst van alle oudere mail van een account en zet die in de lokale zoekindex.',
    diskSpace:
      'Dit gebruikt tijdelijk extra schijfruimte: Mailspring bewaart de gedownloade tekst 14 dagen en verwijdert hem daarna weer. De zoekindex zelf blijft staan, ongeveer 5% van de grootte van de mailbox.',
    limits:
      'Per bericht worden de eerste 5.000 tekens geïndexeerd, bijlagen niet, en spam en prullenbak worden overgeslagen.',
    noAccounts: 'Je hebt nog geen accounts.',
    counting: 'Tellen…',
    allIndexed: 'Alle mail is doorzoekbaar.',
    remaining: '%@ berichten nog niet doorzoekbaar',
    estimate: 'tijdelijk ongeveer %@',
    start: 'Alle mail indexeren',
    resume: 'Hervatten',
    pause: 'Pauzeren',
    statusRunning: 'Bezig met indexeren… %@ klaar',
    statusSlow:
      '%@ klaar. Wachten tot het account berichten ophaalt, dat kan tot een half uur duren.',
    statusWaiting: 'Wachten: er kwam 35 minuten geen tekst binnen. Is het account offline? Over 5 minuten opnieuw.',
    statusPaused: 'Gepauzeerd na %@ berichten.',
    statusDone: 'Klaar: %@ berichten geïndexeerd.',
    statusError: 'Gestopt door een fout: %@',
    failed: '%@ konden niet worden gedownload en worden na een herstart opnieuw geprobeerd.',
    confirmTitle: 'Alle mail van %@ indexeren?',
    confirmDetail:
      'Mailspring downloadt de tekst van %@ oudere berichten. Dat gebruikt tijdelijk ongeveer %@ extra schijfruimte, die na 14 dagen weer vrijkomt. Je kunt altijd pauzeren, en na een herstart gaat het indexeren verder.',
  },
};

function currentLanguage() {
  const chosen = AppEnv.config.get('core.intl.language');
  const locale = chosen || navigator.language || 'en';
  return locale.split('-')[0].toLowerCase();
}

function t(key, ...args) {
  const table = STRINGS[currentLanguage()] || STRINGS.en;
  let value = table[key] || STRINGS.en[key] || key;
  for (const arg of args) {
    value = value.replace('%@', arg);
  }
  return value;
}

function formatNumber(n) {
  return new Intl.NumberFormat(currentLanguage()).format(n);
}

function formatBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${formatNumber(Math.round((mb / 1024) * 10) / 10)} GB`;
  }
  return `${formatNumber(Math.max(1, Math.round(mb)))} MB`;
}

module.exports = { t, formatNumber, formatBytes };
