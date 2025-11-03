# Installation Guide

## Prerequisites

- Python 3.9+
- Node.js 18+

## Quick Install

```bash
cd pythonmonkey-sdk

# Install SDK from npm
npm install

# Install Python package
pip install -e .

# Test
python test_import.py
```

## Verify

```bash
python -c "from vortex_sdk import VortexSDK; print('✓ Ready')"
```

## Troubleshooting

**"Node.js not found"**
```bash
node --version  # Should show v18+
```

**"@vortexfi/sdk not found"**
```bash
npm install
```

**"Module not found"**
```bash
pip install -e . --force-reinstall
```

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for more help.
