import http from './http';

/**
 * Simple request wrapper for ProfileSettings component
 * Uses the existing http utility with axios
 */
export const request = async ({ url, method = 'GET', data = null }) => {
  try {
    const config = {
      url,
      method: method.toLowerCase(),
    };

    if (data && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT')) {
      config.data = data;
    }

    const response = await http(config);
    return response.data;
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
};

export default request;
