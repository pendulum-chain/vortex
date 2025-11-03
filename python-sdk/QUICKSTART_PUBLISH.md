# Quick Start: Publishing to PyPI

This is a condensed guide to publish the Vortex SDK to PyPI. For detailed instructions, see [PUBLISHING.md](PUBLISHING.md).

## 1. Install Publishing Tools

```bash
pip install --upgrade build twine
```

## 2. Create PyPI Account

- Register at [PyPI](https://pypi.org/account/register/)
- Get an API token from [Account Settings](https://pypi.org/manage/account/)

## 3. Build the Package

```bash
cd python-sdk

# Clean previous builds
rm -rf build/ dist/ *.egg-info

# Build
python -m build
```

## 4. Upload to PyPI

```bash
# Using environment variable (recommended)
export TWINE_USERNAME=__token__
export TWINE_PASSWORD=pypi-YOUR_API_TOKEN_HERE

# Upload
python -m twine upload dist/*
```

## 5. Verify

```bash
# Install from PyPI
pip install vortex-finance-sdk

# Test
python -c "from vortex_sdk import VortexSdk; print('Success!')"
```

## Done! 🎉

Your package is now live at: https://pypi.org/project/vortex-finance-sdk/

Users can install it with:
```bash
pip install vortex-finance-sdk
```

## Optional: Test First on TestPyPI

Before publishing to production PyPI, you can test on TestPyPI:

```bash
# Upload to TestPyPI
python -m twine upload --repository testpypi dist/*

# Install from TestPyPI
pip install --index-url https://test.pypi.org/simple/ --no-deps vortex-finance-sdk
```

## Important Notes

- **Version Numbers**: PyPI doesn't allow overwriting versions. Always increment the version in `pyproject.toml` before publishing updates.
- **Security**: Never commit your `.pypirc` file or API tokens to Git
- **Package Name**: If "vortex-finance-sdk" is taken, choose a different name in `pyproject.toml`

For detailed troubleshooting and best practices, see [PUBLISHING.md](PUBLISHING.md).
