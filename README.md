# Search Index for Mailspring

A plugin for [Mailspring](https://getmailspring.com), the open-source desktop mail client for Windows, macOS and Linux.

Make search find words in all your old mail, not just the last three months.

Mailspring only downloads the text of mail from the last three months. In older messages, search finds the sender, recipients and subject, but no words from the message itself. This plugin has Mailspring download the text of all older mail of an account once, so it ends up in the local search index too.

## Features

- **Preferences › Search Index** shows, per account, how many messages are not yet searchable and roughly how much disk space indexing them takes temporarily, with an **Index All Mail** button.
- **Batches, newest first.** The plugin asks Mailspring's sync engine for the text 20 messages at a time, the same way opening a message does. The engine adds the text to the search index.
- **Pause at any time.** If indexing was running when you quit Mailspring, it continues a minute after the next launch.
- **Retries on its own.** If no text arrives for 35 minutes, for example because the account is offline, the plugin waits five minutes and tries again.
- **Stays on your computer.** The text is fetched over the account's own IMAP connection and indexed locally.
- **English and Dutch** interface text, following the language set in Preferences › General.

## Installation

### From a release

1. Download the source code (zip) of the [latest release](https://github.com/leksts/mailspring-search-index/releases/latest) and unzip it.
2. In Mailspring, choose **Developer › Install a Plugin…** and select the unzipped folder.

Mailspring copies the plugin into its `packages` folder and activates it right away.

### With git

Clone the repository into Mailspring's `packages` folder (create the folder if it doesn't exist):

| Platform | Packages folder |
|----------|-----------------|
| Windows  | `%APPDATA%\Mailspring\packages\` |
| macOS    | `~/Library/Application Support/Mailspring/packages/` |
| Linux    | `~/.config/Mailspring/packages/` |

```bash
git clone https://github.com/leksts/mailspring-search-index.git search-index
```

Then quit Mailspring completely (including the tray or menu bar icon) and start it again. To update later, run `git pull` in that folder and restart Mailspring.

### Uninstall

Delete the `search-index` folder from the packages folder and restart Mailspring. Everything already indexed stays searchable.

## Usage

1. Open **Preferences › Search Index**.
2. Click **Index All Mail** next to an account and confirm. Start with a small account to see how it goes.
3. Follow the progress in the same tab. Search finds words in old mail as soon as its text has arrived.

**Getting started can be slow on some accounts.** The engine may only pick up the request after a while, sometimes up to half an hour, for example while it is still syncing or when the server keeps the connection idle. When an account is slow to respond, the plugin requests bigger batches. If nothing seems to happen, see [Troubleshooting](#troubleshooting).

## Disk space

Mailspring keeps the downloaded text for 14 days and then deletes it again, for all messages older than three months. The search index stays. Expect:

- **temporarily:** about the average size of a stored message (often 20–40 KB, mostly HTML) times the number of messages. The plugin shows an estimate per account.
- **permanently:** roughly 5% of the mailbox size for the index.

SQLite does not shrink the database file when data is deleted; the freed space is reused for new mail. To actually shrink `edgehill.db`, quit Mailspring completely, back up the file and run `VACUUM` on it.

## Known limitations

These come from Mailspring's sync engine, not from the plugin:

- Only the first 5,000 characters of each message are indexed.
- Attachments are not indexed.
- Spam and trash are skipped.

## Troubleshooting

The plugin logs every start, pause, resume and batch to `search-index.log`, in the folder that contains the `packages` folder (next to Mailspring's `config.json`). Mailspring's own `mailsync-<account>.log` files in that folder show `Fetching body for message ID …` for every message the engine downloads.

## Compatibility

Tested with Mailspring 1.26.0 on Windows. Besides Mailspring's public plugin APIs, the plugin reads the local database through `DatabaseStore._query`, an internal function that may change in a future Mailspring release.

## Development

The plugin is plain JavaScript (CommonJS, `React.createElement`) with no build step, because packaged Mailspring builds don't compile TypeScript or JSX for third-party plugins.

| Path | Contents |
|------|----------|
| `lib/main.js` | Registers the preferences tab and resumes runs after launch |
| `lib/indexer.js` | Finds unindexed messages, requests their text in batches and tracks progress |
| `lib/preferences-search-index.js` | The Search Index preferences tab |
| `lib/strings.js` | English and Dutch interface text |
| `styles/` | LESS styles, loaded by Mailspring automatically |

A message counts as indexed when it has a snippet, the short preview in the message list, which the engine takes from the same text it indexes.

To try a change, edit the files in your packages folder (or clone there) and choose **Developer › Reload**.

## Acknowledgements

This plugin is built on [Mailspring](https://github.com/Foundry376/Mailspring) by Foundry 376 and its contributors, and relies on its plugin system and sync engine. Mailspring is licensed under the [GPL-3.0](https://github.com/Foundry376/Mailspring/blob/master/LICENSE.md).

Search Index is an independent project. It is not affiliated with or endorsed by Foundry 376. "Mailspring" is used only to say which application the plugin works with.

## License

[MIT](LICENSE) © Leks ter Schuur
