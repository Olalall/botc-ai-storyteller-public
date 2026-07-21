# Screenshots / 功能截图

These screenshots were generated from the local public package and are intended for the GitHub README and project description.

这些截图来自本地可运行公开包，用于展示项目的大部分核心功能。GIF 是由下列关键截图合成的短流程预览。

## Animated overview / GIF 总览

![Core flow GIF](images/demo-core-flow.gif)

Covers: welcome → menu → room lobby → script switch → setup/deal → night flow → day vote → role library → AI boundary.

## Coverage map / 截图覆盖范围

| File | Feature shown |
| --- | --- |
| `storyteller-welcome.png` | Unofficial welcome screen, room creation, player count, no PI / publisher logos |
| `storyteller-main-menu.png` | Main menu, workflow entry points, settings access |
| `player-seat-select.png` | Mobile player joins by room code and chooses a seat |
| `player-waiting-room.png` | Player waits after joining; storyteller can see joined players |
| `storyteller-room-lobby.png` | Room code, seats, test-player fill, public state, right-side flow guide |
| `storyteller-script-switch.png` | Script selection/switch preview before identities are sent |
| `storyteller-setup-deal.png` | Setup candidate generation, storyteller confirmation, demon bluff/private info preview |
| `storyteller-deal-confirm.png` | Final confirmation before private identities are sent |
| `player-identity-receipt.png` | Player mobile receipt after identity delivery; player sees only their own PlayerView |
| `storyteller-night-flow.png` | Night order, current role, automatic skill-result candidate settlement, result review and storyteller confirmation boundary |
| `storyteller-day-vote.png` | Nomination, vote threshold, vote cards, execution confirmation |
| `storyteller-role-library.png` | Role/script reference library, role icons, ability text and local notes entry |
| `storyteller-private-message.png` | Storyteller private-message/info delivery panel |
| `storyteller-manual-tool.png` | Manual storyteller control area for edge cases and human rulings |
| `storyteller-history-log.png` | Operation/history log for replaying important game events |
| `storyteller-game-review.png` | Game review / end-of-game review page |
| `storyteller-ai-boundary.png` | AI assistant panel; AI drafts only, storyteller confirms final state changes |

## Screenshots

### 1. Storyteller welcome

![Storyteller welcome](images/storyteller-welcome.png)

Shows the cleaned unofficial welcome screen. PI / publisher logos are not shown in the public-facing cover screenshot.

### 2. Main menu

![Main menu](images/storyteller-main-menu.png)

Shows the top-level menu and major storyteller workflow entry points.

### 3. Player seat select

![Player seat select](images/player-seat-select.png)

Shows the mobile player flow for joining by room code and choosing a seat.

### 4. Player waiting room

![Player waiting room](images/player-waiting-room.png)

Shows the player-side waiting state after claiming a seat.

### 5. Room and seats

![Room lobby](images/storyteller-room-lobby.png)

Shows room creation, room code, player count, test-player filling, grimoire seats, public state buttons, and the right-side main-flow guide.

### 6. Script switch

![Script switch](images/storyteller-script-switch.png)

Shows script selection before setup is locked. Switching remains an explicit storyteller action.

### 7. Setup and deal

![Setup and deal](images/storyteller-setup-deal.png)

Shows setup candidate generation, storyteller confirmation boundary, demon bluffs, player privacy note, and identity preview.

### 8. Send identities

![Deal confirmation](images/storyteller-deal-confirm.png)

Shows the final confirmation step before private identities are sent to players. The app explains that players receive only their own PlayerView, not the full grimoire.

### 9. Player identity receipt

![Player identity receipt](images/player-identity-receipt.png)

Shows that the player receives only their own identity and allowed private/public information on a phone-sized viewport.

### 10. Night flow

![Night flow](images/storyteller-night-flow.png)

Shows night order, player submissions, current role handling, automatic skill-result candidate settlement, candidate/result review, and operation log.

### 11. Day vote

![Day vote](images/storyteller-day-vote.png)

Shows nomination, vote threshold, real-time vote cards, vote log, and execution confirmation area.

### 12. Role library

![Role library](images/storyteller-role-library.png)

Shows the script/role reference library with role icons, ability text, script tabs, and local ability-note editing entry points.

### 13. Private message / info panel

![Private message](images/storyteller-private-message.png)

Shows storyteller-controlled private information delivery. This is useful for reminders, whispers, and human-reviewed edge cases.

### 14. Manual storyteller tool

![Manual storyteller tool](images/storyteller-manual-tool.png)

Shows manual controls for situations where a human ruling is required instead of accepting automatic settlement candidates.

### 15. History log

![History log](images/storyteller-history-log.png)

Shows the operation/history log used to review important actions during the game.

### 16. Game review

![Game review](images/storyteller-game-review.png)

Shows the review area for after-game inspection and recap.

### 17. AI boundary

![AI boundary](images/storyteller-ai-boundary.png)

Shows the AI assistant boundary: AI summarizes and suggests; final execution remains with the storyteller.

## Notes

- Screenshots are generated locally from `storyteller-v2.html`, `player-v2.html`, and review pages.
- Downloaded role icons are local runtime cache files and are not committed to the repository.
- The GIF is a lightweight README preview, not a substitute for real-table acceptance testing.