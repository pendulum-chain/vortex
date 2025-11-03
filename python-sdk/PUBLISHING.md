# Publishing Guide for Vortex Python SDK

This guide will help you publish the Vortex Python SDK to PyPI (Python Package Index).

## Prerequisites

1. **PyPI Account**: Create accounts on both:
   - [PyPI](https://pypi.org/account/register/) (production)
   - [TestPyPI](https://test.pypi.org/account/register/) (testing)

2. **Install Publishing Tools**:
```bash
pip install --upgrade build twine
```

## Step 1: Prepare Your Package

### 1.1 Update Version Number

Edit `pyproject.toml` and update the version:
```toml
version = "0.1.0"  # Change as needed
```

Also update in `vortex_sdk/__init__.py`:
```python
__version__ = "0.1.0"
```

### 1.2 Verify Package Structure

Ensure your directory structure looks like this:
```
python-sdk/
├── vortex_sdk/
│   ├── __init__.py
│   ├── vortex_sdk.py
│   ├── api_service.py
│   ├── brl_handler.py
│   ├── constants.py
│   └── errors.py
├── examples/
├── README.md
├── LICENSE
├── pyproject.toml
├── setup.py
├── MANIFEST.in
└── requirements.txt
```

### 1.3 Test Locally

```bash
cd python-sdk

# Install in development mode
pip install -e .

# Test imports
python -c "from vortex_sdk import VortexSdk; print('Success!')"

# Run examples (optional)
python examples/example_brl_onramp.py
```

## Step 2: Build the Package

### 2.1 Clean Previous Builds

```bash
cd python-sdk
rm -rf build/ dist/ *.egg-info
```

### 2.2 Build Distribution Files

```bash
python -m build
```

This creates:
- `dist/vortex_finance_sdk-0.1.0-py3-none-any.whl` (wheel file)
- `dist/vortex-finance-sdk-0.1.0.tar.gz` (source distribution)

### 2.3 Verify the Build

```bash
# Check the contents
tar -tzf dist/vortex-finance-sdk-0.1.0.tar.gz

# Install locally to test
pip install dist/vortex_finance_sdk-0.1.0-py3-none-any.whl
```

## Step 3: Test on TestPyPI (Recommended)

### 3.1 Configure TestPyPI Credentials

Create or edit `~/.pypirc`:
```ini
[testpypi]
  username = __token__
  password = pypi-YOUR_TEST_PYPI_API_TOKEN_HERE
```

Or use environment variable:
```bash
export TWINE_USERNAME=__token__
export TWINE_PASSWORD=pypi-YOUR_TEST_PYPI_API_TOKEN_HERE
```

### 3.2 Upload to TestPyPI

```bash
python -m twine upload --repository testpypi dist/*
```

### 3.3 Test Installation from TestPyPI

```bash
# In a new virtual environment
pip install --index-url https://test.pypi.org/simple/ --no-deps vortex-finance-sdk

# Test it works
python -c "from vortex_sdk import VortexSdk; print('TestPyPI install successful!')"
```

## Step 4: Publish to PyPI (Production)

### 4.1 Get API Token

1. Go to [PyPI Account Settings](https://pypi.org/manage/account/)
2. Scroll to "API tokens"
3. Click "Add API token"
4. Name it (e.g., "vortex-sdk-upload")
5. Copy the token (starts with `pypi-`)

### 4.2 Configure PyPI Credentials

Update `~/.pypirc`:
```ini
[pypi]
  username = __token__
  password = pypi-YOUR_PYPI_API_TOKEN_HERE
```

Or use environment variable:
```bash
export TWINE_USERNAME=__token__
export TWINE_PASSWORD=pypi-YOUR_PYPI_API_TOKEN_HERE
```

### 4.3 Upload to PyPI

```bash
python -m twine upload dist/*
```

### 4.4 Verify Publication

1. Visit: https://pypi.org/project/vortex-finance-sdk/
2. Test installation:
```bash
pip install vortex-finance-sdk
```

## Step 5: Post-Publication

### 5.1 Test Installation

In a fresh virtual environment:
```bash
# Create new environment
python -m venv test_env
source test_env/bin/activate  # On Windows: test_env\Scripts\activate

# Install from PyPI
pip install vortex-finance-sdk

# Test it works
python -c "from vortex_sdk import VortexSdk, RampDirection; print('Install successful!')"
```

### 5.2 Update Documentation

Update your README with installation instructions:
```markdown
## Installation

```bash
pip install vortex-finance-sdk
```
\`\`\`

## Publishing Updates

When you want to publish a new version:

1. **Update version numbers** in:
   - `pyproject.toml`
   - `vortex_sdk/__init__.py`

2. **Clean and rebuild**:
```bash
rm -rf build/ dist/ *.egg-info
python -m build
```

3. **Test on TestPyPI** (optional but recommended):
```bash
python -m twine upload --repository testpypi dist/*
```

4. **Upload to PyPI**:
```bash
python -m twine upload dist/*
```

## Troubleshooting

### Error: "File already exists"

This means you're trying to upload a version that's already on PyPI. You must increment the version number in `pyproject.toml`.

### Error: "Invalid distribution file"

Make sure you've cleaned old build artifacts:
```bash
rm -rf build/ dist/ *.egg-info
python -m build
```

### Error: "401 Unauthorized"

Check your API token is correct and has upload permissions.

### Package Name Already Taken

If `vortex-finance-sdk` is taken, choose a different name:
1. Update `name` in `pyproject.toml`
2. Rebuild and upload

## Best Practices

1. **Always test on TestPyPI first** before publishing to PyPI
2. **Use semantic versioning**: MAJOR.MINOR.PATCH (e.g., 0.1.0, 0.2.0, 1.0.0)
3. **Tag releases in Git**:
   ```bash
   git tag -a v0.1.0 -m "Release version 0.1.0"
   git push origin v0.1.0
   ```
4. **Keep a CHANGELOG.md** to track changes between versions
5. **Never reuse version numbers** - PyPI doesn't allow overwriting

## Security Notes

- **Never commit `.pypirc`** to version control (it's already in .gitignore)
- **Use API tokens** instead of passwords
- **Limit token scope** to only upload permissions if possible
- **Rotate tokens periodically**

## Resources

- [Python Packaging Guide](https://packaging.python.org/)
- [PyPI Help](https://pypi.org/help/)
- [Twine Documentation](https://twine.readthedocs.io/)
- [setuptools Documentation](https://setuptools.pypa.io/)
