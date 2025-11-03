"""
Setup script for the Vortex Python SDK.
"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="vortex-sdk",
    version="0.1.0",
    author="Vortex Finance",
    author_email="support@vortexfinance.co",
    description="Python SDK for Vortex Finance cross-chain ramp operations",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/pendulum-chain/vortex",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    python_requires=">=3.8",
    install_requires=[
        "requests>=2.31.0",
    ],
)
