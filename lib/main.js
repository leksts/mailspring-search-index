const { PreferencesUIStore } = require('mailspring-exports');
const Indexer = require('./indexer');
const { t } = require('./strings');

let preferencesTab = null;

function activate() {
  preferencesTab = new PreferencesUIStore.TabItem({
    tabId: 'Search Index',
    displayName: t('preferencesTab'),
    componentClassFn: () => require('./preferences-search-index'),
  });
  PreferencesUIStore.registerPreferencesTab(preferencesTab);

  Indexer.resumeAfterLaunch();
}

function deactivate() {
  Indexer.stopAll();
  if (preferencesTab) {
    PreferencesUIStore.unregisterPreferencesTab(preferencesTab);
    preferencesTab = null;
  }
}

module.exports = { activate, deactivate };
