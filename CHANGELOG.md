# Changelog

## [1.19.4]
### Fixes
- Fixed conda installation verification

## [1.19.3]
### Features
- Implemented a new status bar hover window displaying current Wake and Anvil versions with compatibility status indicators

### Improvements
- Show autosave toggle only when chain persistance is enabled
- Added Anvil version tracking
- Updated analytics with dependency version tracking information

### Fixes
- Resolved race condition during chain initialization that prevented reliable creation of the default initial chain

## [1.19.2]
### Fixes
- Fixed compilation issues caused by unreliable `remappings.txt` files in Foundry projects

## [1.19.1]
### Features
- Added Wake version information to the bottom status bar
- Implemented filtering for ignored detections in the detections UI

### Improvements
- Store ignored detections toggle setting in workspace storage for better persistence

### Fixes
- Fixed state loading issues and disabled autosave by default

## [1.19.0]
### Features
- Introduced pre-configured chains, such as Ethereum Mainnet and popular L2 networks (Optimism, Arbitrum, Base, Polygon, etc.), significantly streamlining the forking process
- Integrated Prettier for automatic code formatting on save, enhancing code quality and consistency
- Added support for the `Osaka` EVM version
- Implemented support for `transient` storage and `layout at` syntax in Solidity grammar

### Fixes
- Multiple grammar fixes

## [1.19.0]
### Features
- Added chain preconfigurations, speeding up forking Mainnet or common L2s (Optimism, Arbitrum, Base, Polygon, ...)

## [1.18.0]
### Features
- Official stable release of version 1.17.0 (previously available as pre-release)
- Added compatibility with Wake's new code coverage format
- Enhanced analytics and telemetry capabilities
- Refreshed README documentation and extension marketplace description

### Fixes
- Resolved an issue where Wake response parsing could cause extension failures

## [1.17.0]
### Features
- Added onchain contract ABI fetching
- Implemented proxy contract support with implementation ABI integration
- Added chain forking capabilities for local development
- Added support for connecting to existing local chain nodes
- Integrated transaction event displays in output view
- Enhanced UX with input tooltips and loading indicators
- Implemented configurable automatic chain state persistence
- Added a new Chain navigator UI element with chain information display
- Improved contract interaction feedback with visual loading states

### Fixes
- Fixed contract compilation expansion issues
- Resolved UI theme consistency issues
- Fixed empty `calldata` handling in function calls
- Corrected `bigint` serialization and processing
- Fixed integer overflow handling in inputs
- Improved type safety in `bigint` operations
- Reduced extension startup messages
- Optimized handling of large transaction values
- Cleaned up residual messages in output view
- Improved chain state persistence reliability
- Fixed chain session stability issues
- Updated Wake dependency to 4.14.0
- Refactored codebase

## [1.16.7]
### Features
- Added support for multiple chain sessions
- Added automatic chain state saving when extension is deactivated, and restoring it on activation
- Refactored the extension's architecture
- Added new error messages to the UI

### Fixes
- Improved error handling on unexpected LSP server crashes
- Minor fixes

## [1.16.6]
### Features
- The extension is now being published also to the Open VSX Registry

### Fixes
- Minor UI fixes
- Fixed the extension not being available on Open VSX

## [1.16.5]
### Features
- Improved the UI of the Deploy and Interact tab

## [1.16.4]
### Fixes
- Fixed language server with conda installation crashing due to colliding Python packages being installed in user site-packages

## [1.16.3]
### Fixes
- Fixed various compilation issues
- Increased timeouts to download solc binaries
- Anvil is now also being detected in standard `~/.foundry/bin` directory

## [1.16.2]
### Fixes
- Python environment variables are now being unset before activating conda environment

## [1.16.1]
### Improvements
- Added auto-importing of Foundry remappings
- Added support for decoding structs in transaction output
- Added option for upcoming Prague EVM version in settings
- Improved error messaging when Wake installation via conda fails
- Refined descriptions for various settings

### Fixes
- Resolved anonymous authentication issues when downloading Wake (conda installation)

## [1.16.0]
### Major changes
- The extension is being rebranded as Solidity for VS Code
- Introducing Deploy and Interact UI - test and interact with your smart contracts on a local node

### Improvements
- Language server now watches for external changes to Solidity files and recompiles automatically
- Improved LSP responsiveness and RAM usage

### Fixes
- Fixed multiple memory leaks in LSP
- Fixed sending compilation build to detectors/printers subprocess causing crashes due to build size & cyclic references
- Fixed multiple minor LSP issues

## [1.14.0]
- Added workspace symbols feature
- Detectors & printers now run in subprocesses, making the language server more responsive
- Re-implemented code lens af LSP printers, making them more configurable (incl. on/off switch via `only` and `exclude` config options)
- Dropped support for Python 3.7
- Bugfixes & stability improvements

## [1.13.1]
- Fixed possible `eth-wake` installation issues

## [1.13.0]
- Added option to disable certain compiler warnings (thanks to @DrakeEvans)
- Improved crash logs
- Fixed language server & detector crashes

## [1.12.0]
- Implemented the initial set of LSP callback features
- Implemented new `eth-wake` installation method (installation into venv) as a fallback
- Fixed language server crashes caused by Wake config changes

## [1.11.5]
- Improved error handling
- Fixed Wake stdout buffer overflow

## [1.11.4]
- Detections UI - Sorting/filtering indicators, state persistence (workspace scoped)
- Wake LSP crashlog

## [1.11.3]
- Fixed language server crashes caused by `distutils` not being available in Python 3.12

## [1.11.2]
- Fixed issue caused by dependent extension for Graphviz preview being removed from the marketplace

## [1.11.1]
- `solc` binaries are automatically re-installed if corrupted
- Fixed language server crashes on Windows caused by unicode characters in printed messages
- Fixed `wake` path detection when using `pipx`

## [1.11.0]
- Wake Detections UI in Activity Bar
- Ignore detections
- Support auto-installation using pipx
- Woke -> Wake migration

## [1.10.4]
- Fixed language server crashes caused by overloaded functions imported in import directives
- Fixed language server crashes caused by new expressions being top-level expressions in expression statements

## [1.10.3]
- Fixed language server crashes caused by `woke` process stdout/stderr buffer overflow

## [1.10.2]
- Fixed compilation crashes
- Fixed secondary locations of solc compiler errors not provided
- Fixed vulnerability detectors causing crashes

## [1.10.1]
- Fixed language server crashes on macOS and Windows

## [1.10.0]
- Implemented hover with helper text for Yul instructions
- Implemented auto-completions for imports
- Implemented quick-fixes for some compiler warnings and errors
- References count in code lens is now clickable
- Document links for imports now work even with compilation errors
- Fixed LSP crashes caused by source unit aliases created in import directives

## [1.9.0]
- Configured `autoClosingPairs` (brackets, quotes, multi-line comments) for Solidity files
- Fixed LSP crash when an identifier path part references a source unit

## [1.8.0]
- Added `Tools for Solidity: Show Coverage` and `Tools for Solidity: Hide Coverage` commands to show/hide coverage information generated by the [Woke](https://ackeeblockchain.com/wake/docs/latest) development and testing framework

## [1.7.1]
- Fixed an issue when the first `woke` installation found was taken as canonical instead of searching for other installation locations

## [1.7.0]
- Added experimental support for Python 3.11
- Fixed potential problems with `woke` installation, especially on macOS

## [1.6.0]
- Added support for Solidity 0.8.19
- Added new command `Tools for Solidity: Generate Imports Graph`
- Improved highlighted range of some vulnerability/code quality detections

## [1.5.0]
- Updated minimal version of Woke to 2.0.0
    - Some LSP features may be available during compilation
    - Stability improvements
- Added `woke.detectors.ignore_paths` and `woke.lsp.compilation_delay` config options
- Added `venv` to `woke.compiler.ignore_paths` config default value
- Added `joaompinto.vscode-graphviz` to extension dependencies

## [1.4.0]
- Introduced new `Tools for Solidity: Import Foundry Remappings` command to automatically configure remappings for Foundry projects
- Added `lib` directory to default `ignore_paths`
- Fixed an issue when `woke` instances would have been left running on an LSP server crash

## [1.3.1]
- Fixed Woke auto-install not working with `python` executable (without `python3` alias)
- Fixed reusing LSP build artifacts causing code lens glitches

## [1.3.0]
- EXPERIMENTAL: Use old LSP compilation artifacts when cannot successfully compile current version of sources
    - Implemented for `Go to definition`, `Document links` (imports), `Hover` and `Go to type definition`
- Reduced LSP server compilation time by merging compilation units
- Ignore all detections originating in `ignore_paths` and having all subdetections also in `ignore_paths`
- Fixed re-entrancy detector not able to detect issues in overridden functions
- Fixed LSP list config options parsing issue

## [1.2.1]
- Fixed `unsafe-address-balance-use` detector reporting all `addr.balance` uses

## [1.2.0]
- Added new [Head Overflow Calldata Tuple ABI-Reencoding Bug](https://blog.soliditylang.org/2022/08/08/calldata-tuple-reencoding-head-overflow-bug/) detector
- Added `woke.detectors.exclude` and `woke.detectors.only` config options to exclude some detectors from the analysis / to only run certain detectors
- Added new Axelar `contractId` detector
- Added LSP code lens with click-to-copy selectors above each (public/external) function / variable / error / event declaration
- LSP diagnostics originating from the solc compiler run are now marked with the `Woke(solc)` label
- Added `woke.lsp.force_rerun_detectors` LSP command
- Improved detection of ownable pattern

## [1.1.0]

- Implemented LSP commands to generate:
    - function control flow graphs
    - contract inheritance graph
    - contract C3 linearized inheritance graph
    - inheritance graph of a whole project
- Improved re-entrancy and ownable detectors
- LSP code lens no longer disappear when editing a file
    - enabled LSP code lens by default
- Fixed a compilation bug when a project contains multiple files with the same content
- Other small fixes

## [1.0.2]

- Extension description updated

## [1.0.1]

- Fixed LSP features for Solidity symbols in inline assembly blocks not working
- Fixed compiler errors not properly cleared

## [1.0.0]

- Initial release