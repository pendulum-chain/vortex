# Enforce rules

- Treat UIs as a thin layer over your data. Skip local state (like useState) unless it's absolutely needed and clearly separate from business logic. Choose variables and useRef if it doesn't need to be reactive.
- When you find yourself with nested if/else or complex conditional rendering, create a new component. Reserve inline ternaries for tiny, readable sections.
- Choose to derive data rather than use useEffect. Only use useEffect when you need to syncronize with an external system (e.g. document-level events). It causes misdirection of what the logic is going. Choose to explicitly define logic rather than depend on implicit reactive behavior
- Treat setTimeout as a last resort (and always comment why)
- IMPORTANT: do not add useless comments. avoid adding comments unless you're clarifying a race condition (setTimeout), a long-term TODO, or clarifying a confusing piece of code even a senior engineer wouldn't initially understand.