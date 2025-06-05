import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { SIGNING_SERVICE_URL } from '../../constants/constants';

// TODO: CONSIDER REACT TANSTACK QUERY

/**
 * Base API client for making requests to the backend
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: `${SIGNING_SERVICE_URL}/v1`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for common headers
apiClient.interceptors.request.use(
  (config) => {
    // Add any common headers here
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Add response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  },
);

/**
 * Helper function to handle API errors
 * @param error The error object
 * @param defaultMessage Default error message
 * @returns Formatted error message
 */
export const handleApiError = (error: unknown, defaultMessage = 'An error occurred'): string => {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data as { error?: string; message?: string; details?: string } | undefined;
    return responseData?.error || responseData?.message || error.message || defaultMessage;
  }
  return error instanceof Error ? error.message : defaultMessage;
};

/**
 * Generic API request function with error handling
 * @param method The HTTP method
 * @param url The endpoint URL
 * @param data The request data
 * @param config Additional axios config
 * @returns The response data
 */
export async function apiRequest<T>(
  method: 'get' | 'post' | 'put' | 'delete',
  url: string,
  data?: any,
  config?: AxiosRequestConfig,
): Promise<T> {
  try {
    const response = await apiClient.request<T>({
      method,
      url,
      data,
      ...config,
    });
    return response.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
}
