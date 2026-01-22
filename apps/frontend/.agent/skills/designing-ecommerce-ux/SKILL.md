---
name: designing-ecommerce-ux
description: Provides high-conversion UX patterns, e-commerce design tokens, and shopping-specific interface rules. Use this when the user asks to build product listings, shopping carts, checkout flows, or customer accounts.
---

# Designing E-commerce UX

## When to use this skill

- When creating a **Product Detail Page (PDP)** or a **Product Listing Page (PLP)**.
- When building **Shopping Carts** or **Checkout Workflows**.
- When designing **Customer Reviews** or **Wishlist** components.

## Workflow

1. [ ] **Layout Planning:** Use a mobile-first approach. Ensure the "Buy" button is visible without scrolling.
2. [ ] **Token Application:** Reference `resources/design-tokens.json` for "Success Green" on checkout buttons.
3. [ ] **Component Implementation:** Use `shadcn/ui` primitives as defined in `resources/tech-stack.md`.
4. [ ] **Validation:** Verify that price and shipping info are clearly legible.

## Instructions

- **Hierarchy:** The Product Title and Price must always be the most prominent text.
- **Trust Signals:** Use Lucide icons for "Secure Checkout" and "Fast Shipping" badges.
- **Micro-interactions:** Show a "Loading" state on the Add-to-Cart button to prevent double-clicks.

## Resources

- 👉 **[`resources/design-tokens.json`](resources/design-tokens.json)** (Shopping colors & spacing)
- 👉 **[`resources/tech-stack.md`](resources/tech-stack.md)** (Performance-focused React/Tailwind rules)
- 👉 **[`resources/voice-tone.md`](resources/voice-tone.md)** (Helpful and trustworthy sales copy)
