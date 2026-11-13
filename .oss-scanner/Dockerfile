# Build image for Anthropic's OSS Scanner (github.com/anthropics/oss-scanner).
# It is built with network access; the audit afterwards runs offline, so everything the
# tests need is fetched here. .oss-scanner/threat_model.md says how to run them.
FROM node:22-bookworm

COPY --from=oven/bun:1.3.1 /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s bun /usr/local/bin/bunx

# PostgreSQL for the API suite, with the credentials apps/api/src/test-utils/preload.ts expects.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql \
    && rm -rf /var/lib/apt/lists/*
RUN service postgresql start \
    && su postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres'\" -c 'CREATE DATABASE vortex_test'" \
    && service postgresql stop
ENV TEST_DB_PORT=5432

# Foundry for contracts/monerium-forwarder.
RUN curl -fsSL https://foundry.paradigm.xyz | bash && /root/.foundry/bin/foundryup
ENV PATH="/root/.foundry/bin:${PATH}"

# Scanner contract: the checkout lives inside the image, at /src.
COPY . /src
WORKDIR /src

RUN git submodule update --init --depth 1 contracts/monerium-forwarder/lib/forge-std
RUN bun install --frozen-lockfile && bun run build:shared && bun run build:sdk
# Compiling caches the solc releases both contract projects pin.
RUN cd contracts/monerium-forwarder && forge build \
    && cd ../relayer && bunx hardhat compile
