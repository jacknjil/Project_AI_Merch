# E-commerce Tech Stack

## Core Rules

- **Mobile First:** All components must be fully functional on 375px screens before scaling up.
- **Performance:** Use Next.js Image components for product photos to ensure fast loading.
- **Accessibility:** All "Buy" buttons must have an `aria-label` describing the product.

## Forbidden Patterns

- No infinite scrolls on search results (use "Load More" buttons to help users keep their place).
- No heavy animations that delay the checkout process.
