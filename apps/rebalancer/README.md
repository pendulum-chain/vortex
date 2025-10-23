# Vortex Rebalancer

## Environment Variables

Before running the application, you need to create a `.env` file in the root directory and provide the required
environment variables. You can use the `.env.example` file as a template:

```bash
cp .env.example .env
```

Then, open the `.env` file and add your Alchemy API key.

```
ALCHEMY_API_KEY=your_alchemy_api_key
PENDULUM_ACCOUNT_SECRET=xxx
MOONBEAM_ACCOUNT_SECRET=xxx
POLYGON_ACCOUNT_SECRET=xxx
```

## Installation

To install dependencies:

```bash
bun install
```

## Running the Application

To run the main application:

```bash
bun run start
```

This project was created using `bun init` in bun v1.2.6. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
