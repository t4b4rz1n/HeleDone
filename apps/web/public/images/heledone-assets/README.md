# Heledone visual asset set

Generated with the built-in ImageGen tool for the Heledone southern-Iran visual system.

- `coastal-welcome.png`: dashboard welcome panorama.
- `palm-corner.png`, `palm-sunset.png`: palm and sunset compositions for navigation, empty states and landing sections.
- `boat-lenj.png`: traditional Persian Gulf boat cutout.
- `shenashir.png`, `coastal-house.png`: Bushehr coastal architecture and shenashir motifs.
- `sea-divider.png`: restrained wave separator.

`sea-divider.png` separates language preferences from administration modules and finishes the Home and Projects content; it also appears in wave-themed empty states. `palm-corner.png` decorates palm-themed empty states (Projects, Settings and Discounts), as well as the existing task activity empty state. Login uses the dedicated transparent `login-workspace-v1.png` background; registration keeps its plain form layout. All artwork remains retained in the project.

- `login-workspace-v1.png`: hand-painted southern coastal work desk and shenashir window, with transparent space for the sign-in form. Full-bleed background on desktop; a short illustration above the form on smaller screens. Generated with the built-in ImageGen tool. Final prompt: [login-workspace-prompt.md](./login-workspace-prompt.md).

The assets use the palette `#FFF8EE`, `#087F83`, `#DF765B`, and `#F2BA49`; decorative imagery is kept independent from semantic status colors.

- `home-welcome-v2.png`: bright shenashir and sea panorama matched to the home reference.
- `home-sidebar-coast.png`: transparent flat coastal scene for the home sidebar.
- `projects-coastal-v1.png`: dedicated Projects panorama, used by the project list and detail headings. Generated and composition-edited with the built-in ImageGen tool.

Projects final prompt: preserve the traditional lenj and teal waterfront workshop, extend the harbor, sea and sandy shore through the left two thirds, and keep only the rightmost third near-white. Bright turquoise, coral and sun-yellow; no people, text, logos or watermark.

## Page-specific Coastal Panoramas

All new panoramas use the built-in ImageGen tool, not the CLI. Their scenes fill approximately two thirds of each image; only one third stays quiet for interface copy. The collection varies between open sea, sand dunes, rock pools, mangroves, coastal crafts and architecture.

| Asset | Pages | Scene |
| --- | --- | --- |
| `dashboard-coastal-v1.png` | Retained alternative | Sandy shoreline and rolling waves; Home keeps its previous artwork |
| `organizations-coastal-v1.png` | Organizations and details | Bushehr courtyard opening onto the sea |
| `teams-coastal-v1.png` | Teams | Two lenj boats by the beach |
| `users-coastal-v1.png` | People | Promenade above a crescent beach |
| `roles-coastal-v1.png` | Roles and permissions | Lookout on a rocky headland |
| `profile-coastal-v1.png` | Profile | Woven chair, shade umbrella and shallow sea |
| `settings-coastal-v1.png` | Settings | Coastal artisan workshop |
| `attendance-coastal-v1.png` | Attendance and time | Sunrise over sand dunes |
| `finance-coastal-v1.png` | Finance and reports | Pearls and a brass balance |
| `notifications-coastal-v1.png` | Notifications | Ney-anban and dammam on the beach |
| `tickets-coastal-v1.png` | Support requests and details | Beach rowboat and toolbox |
| `ticket-types-coastal-v1.png` | Support categories | Shells and a tidal rock pool |
| `discounts-coastal-v1.png` | Discounts | Southern coastal craft market |
| `automations-coastal-v1.png` | Automations | Harbor winch and a sail catching the breeze |
| `tasks-coastal-v1.png` | Tasks, boards and task details | Planning table beside the surf |
| `standups-coastal-v1.png` | Daily standups | Tea and three chairs on the sand |
| `leadership-coastal-v1.png` | Admin, manager, team lead | Mangrove creek and sandy banks |
| `auth-coastal-v1.png` | Onboarding; retained alternative for authentication | Open door overlooking the beach |

Shared empty-state artwork also uses this new collection; existing user avatars are unchanged. The exact final prompt set is recorded in [coastal-prompts.md](./coastal-prompts.md).

Home uses `home-welcome-v2.png` again, with `home-sidebar-coast.png` in the sidebar and `coastal-welcome.png` in the personal workspace. All remaining generated assets are retained in the project regardless of current usage. Ten earlier compositions are preserved under [variants/](./variants/README.md), alongside the nineteen final panoramas in this directory. Do not remove unused illustrations during asset cleanup.
