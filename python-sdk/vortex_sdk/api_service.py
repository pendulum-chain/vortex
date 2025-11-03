"""
API service for communicating with the Vortex backend.
"""

import requests
from typing import Dict, Any, Optional
from .errors import (
    APIConnectionError,
    APIResponseError,
    parse_api_error,
    NetworkError,
)


class ApiService:
    """
    Service class for making HTTP requests to the Vortex API.
    """
    
    def __init__(self, api_base_url: str):
        """
        Initialize the API service.
        
        Args:
            api_base_url: Base URL of the Vortex API
        """
        self.api_base_url = api_base_url.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json'
        })
    
    def _handle_response(self, response: requests.Response, endpoint: str) -> Dict[str, Any]:
        """
        Handle API response and raise appropriate errors.
        
        Args:
            response: HTTP response object
            endpoint: API endpoint that was called
            
        Returns:
            Parsed JSON response
            
        Raises:
            VortexSdkError: If the API returns an error
        """
        if not response.ok:
            try:
                error_data = response.json()
            except ValueError:
                raise APIResponseError(endpoint, response.status_code, response.reason)
            
            raise parse_api_error(error_data)
        
        try:
            return response.json()
        except ValueError as e:
            raise NetworkError(f"Failed to parse response from {endpoint}: {str(e)}")
    
    def create_quote(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new quote.
        
        Args:
            request: Quote request parameters
            
        Returns:
            Quote response
        """
        endpoint = f"{self.api_base_url}/v1/quotes"
        try:
            response = self.session.post(endpoint, json=request)
            return self._handle_response(response, "/v1/quotes")
        except requests.RequestException as e:
            raise APIConnectionError("/v1/quotes", e)
    
    def get_quote(self, quote_id: str) -> Dict[str, Any]:
        """
        Get an existing quote by ID.
        
        Args:
            quote_id: Quote identifier
            
        Returns:
            Quote response
        """
        endpoint = f"{self.api_base_url}/v1/quotes/{quote_id}"
        try:
            response = self.session.get(endpoint)
            return self._handle_response(response, f"/v1/quotes/{quote_id}")
        except requests.RequestException as e:
            raise APIConnectionError(f"/v1/quotes/{quote_id}", e)
    
    def register_ramp(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Register a new ramp process.
        
        Args:
            request: Ramp registration request
            
        Returns:
            Ramp process response
        """
        endpoint = f"{self.api_base_url}/v1/ramp/register"
        try:
            response = self.session.post(endpoint, json=request)
            return self._handle_response(response, "/v1/ramp/register")
        except requests.RequestException as e:
            raise APIConnectionError("/v1/ramp/register", e)
    
    def update_ramp(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update a ramp process with transaction hashes or presigned transactions.
        
        Args:
            request: Ramp update request
            
        Returns:
            Updated ramp process
        """
        endpoint = f"{self.api_base_url}/v1/ramp/update"
        try:
            response = self.session.post(endpoint, json=request)
            return self._handle_response(response, "/v1/ramp/update")
        except requests.RequestException as e:
            raise APIConnectionError("/v1/ramp/update", e)
    
    def start_ramp(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Start a registered ramp process.
        
        Args:
            request: Start ramp request
            
        Returns:
            Started ramp process
        """
        endpoint = f"{self.api_base_url}/v1/ramp/start"
        try:
            response = self.session.post(endpoint, json=request)
            return self._handle_response(response, "/v1/ramp/start")
        except requests.RequestException as e:
            raise APIConnectionError("/v1/ramp/start", e)
    
    def get_ramp_status(self, ramp_id: str) -> Dict[str, Any]:
        """
        Get the status of a ramp process.
        
        Args:
            ramp_id: Ramp identifier
            
        Returns:
            Ramp process status
        """
        endpoint = f"{self.api_base_url}/v1/ramp/{ramp_id}"
        try:
            response = self.session.get(endpoint)
            return self._handle_response(response, f"/v1/ramp/{ramp_id}")
        except requests.RequestException as e:
            raise APIConnectionError(f"/v1/ramp/{ramp_id}", e)
    
    def get_brl_kyc_status(self, tax_id: str) -> Dict[str, Any]:
        """
        Get BRL KYC status for a tax ID.
        
        Args:
            tax_id: Brazilian tax ID
            
        Returns:
            KYC status response
        """
        endpoint = f"{self.api_base_url}/v1/brla/getUser"
        try:
            response = self.session.get(endpoint, params={"taxId": tax_id})
            return self._handle_response(response, "/v1/brla/getUser")
        except requests.RequestException as e:
            raise APIConnectionError("/v1/brla/getUser", e)
