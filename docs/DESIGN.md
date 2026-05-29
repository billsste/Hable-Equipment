# EquipDispatch Design Tokens — Stripe

Source: VoltAgent/awesome-design-md `design-md/stripe/DESIGN.md`. Stripe was
chosen because the tracker is a dense, professional B2B operations dashboard
viewed by clinical staff — light surface, navy text, conservative radii, and
restrained color match what users expect from financial-grade software.

## Color

```
canvas        #ffffff   page background
surface       #ffffff   cards / panels
surface-soft  #f6f9fc   table headers, subtle fills
border        #e5edf5   default border
border-strong #d6d9fc   hover / selected border

heading       #061b31   primary headings (deep navy — not black)
label         #273951   form labels, secondary headings
body          #64748d   secondary text, descriptions, captions
muted         #94a3b8   disabled, em-dash placeholders

accent        #533afd   primary CTA, links, focus
accent-hover  #4434d4
accent-soft   #b9b9f9   ghost border, subdued hover

success       #15be53   value
success-text  #108c3d
success-bg    rgba(21,190,83,0.2)

danger        #e5484d
warn          #9b6829   lemon — discharge soon
brand-dark    #1c1e54   immersive sections (we use sparingly: sidebar header)
```

Status pill formula: `bg = rgba(<value>, 0.18)`, `text = solid color`,
`border = rgba(<value>, 0.40)` if needed.

## Type

- Family: Inter (fallback `sohne-var`, `SF Pro Display`, `system-ui`).
  Inter is the open substitute for Stripe's proprietary `sohne-var`.
- Display 300 weight, body 300, button/nav 400.
- Sizes: 10 / 12 / 13 / 14 / 16 / 18 / 22 / 26 / 32 / 48 / 56.
- Tracking tightens with size: -0.22px @ 22, -0.64px @ 32, -0.96px @ 48.
- Tabular numerals (`font-feature-settings: "tnum"`) on order numbers and dates.

## Spacing

Base 8. Dense at small end: 4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24 / 32 / 48.

## Radii

4 (default — buttons, inputs, badges) / 6 (cards, nav) / 8 (featured panels).
**No pill shapes.** Stripe is conservative — pills look off-brand here.

## Shadow

```
ambient   rgba(23,23,23,0.06) 0 3px 6px        subtle hover lift
standard  rgba(23,23,23,0.08) 0 15px 35px      default card
elevated  rgba(50,50,93,0.25) 0 30px 45px -30px,
          rgba(0,0,0,0.10) 0 18px 36px -18px   modals, dropdowns
```

Blue-tinted shadows are part of the brand — never use neutral gray.

## Components (as used in this app)

- **Button primary**: bg #533afd, text #fff, 8×16, radius 4. Hover #4434d4.
- **Button ghost**: transparent, text #533afd, 1px #b9b9f9, radius 4. Hover bg rgba(83,58,253,0.05).
- **Button neutral**: bg #fff, text #273951, 1px #e5edf5, radius 4.
- **Input**: 1px #e5edf5, radius 4, 8×12, focus 1px #533afd.
- **Pill / status**: radius 4, 1×6, 11px text, weight 400. Per-status bg+text from STAGE_COLORS / AUTH_COLORS in `lib/order-types.ts`.
- **Card**: bg #fff, 1px #e5edf5, radius 6, ambient shadow.
- **Table row**: 48px tall, hairline #e5edf5 bottom border, hover bg #f6f9fc.
- **Modal**: bg #fff, radius 8, elevated shadow, scrim rgba(6,27,49,0.4).
