from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="vortex-sdk-python",
    version="0.1.0",
    author="Pendulum Chain",
    author_email="info@pendulumchain.tech",
    description="Python wrapper for Vortex SDK using PythonMonkey",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/pendulum-chain/vortex",
    project_urls={
        "Bug Tracker": "https://github.com/pendulum-chain/vortex/issues",
        "Documentation": "https://docs.vortex.pendulumchain.tech",
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Operating System :: OS Independent",
    ],
    package_dir={"": "src"},
    packages=find_packages(where="src"),
    python_requires=">=3.9",
    install_requires=[
        # No Python dependencies - uses Node.js subprocess
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "pytest-cov>=4.0.0",
            "pytest-asyncio>=0.21.0",
            "black>=23.0.0",
            "mypy>=1.0.0",
            "ruff>=0.1.0",
        ],
    },
    include_package_data=True,
    package_data={
        "vortex_sdk": ["py.typed"],
    },
)
