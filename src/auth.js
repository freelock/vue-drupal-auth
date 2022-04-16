import axios from 'axios';
import createAuthRefreshInterceptor from 'axios-auth-refresh';

/**
 * Auth handler designed for use with Drupal web services, including REST and JSON:API.
 *
 * This handler currently supports:
 *
 * - Session authentication (regular login cookie) with CSRF token handling
 *
 * - OAuth2 authentication -- "password" aka "user credentials"
 *
 * This is built to help Vue projects load data from Drupal that requires authentication.
 *
 * Vue uses dotenv package to import environment variables into the running instance. Using these,
 * with this library you can set an OAuth client ID in a variable, and pass in client credentials
 * using the oauthLogin function (e.g. from a login form). Or, if this variable does not exist,
 * this library will retrieve and add a CSRF token instead.
 *
 * To use OAuth, set this variable -- for example, in a .env.development file (which won't get
 * read when built for production):
 *
 * - VUE_APP_CLIENT_ID
 *
 * You also need to set an auth endpoint:
 *
 * - VUE_APP_OAUTH_ENDPOINT
 *
 * If VUE_APP_CLIENT_ID is not defined, this library assumes the site is using a session cookie,
 * and will attempt to fetch a CSRF token if it does not already have one, using the Drupal 9
 * default path:
 *
 * /session/token
 *
 * ... this may be overridden by setting:
 *
 * - VUE_APP_CSRF_TOKEN_ENDPOINT
 *
 */

let tokenClient;
let oauthEndpoint = null;
if (process.env.VUE_APP_CLIENT_ID) {
  oauthEndpoint = process.env.VUE_APP_OAUTH_ENDPOINT || '/oauth/token';
}

function setAccessToken(token) {
  localStorage.setItem('access_token', token);
}

/**
 * Logic to use a refresh_token to get a new access token when a client gets a 401 response.
 *
 * @param {object} failedRequest
 * @returns Promise
 */
const refreshAuthLogic = (failedRequest) => {
  const data = new FormData();
  data.append('grant_type', 'refresh_token');
  data.append('client_id', process.env.VUE_APP_CLIENT_ID);
  data.append('refresh_token', localStorage.getItem('refresh_token'));
  if (process.env.VUE_APP_CLIENT_SECRET && process.env.VUE_APP_CLIENT_SECRET.length) {
    data.append('client_secret', process.env.VUE_APP_CLIENT_SECRET);
  }
  return tokenClient.post('', data, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: null,
    },
    skipAuthRefresh: true,
  })
    .then((tokenRefreshResponse) => {
      setAccessToken(tokenRefreshResponse.data.access_token);
      localStorage.setItem('refresh_token', tokenRefreshResponse.data.refresh_token);
      return Promise.resolve(failedRequest);
    });
};

const getAccessToken = () => localStorage.getItem('access_token');

/**
 * requestInterceptor to handle auth or csrf on a web service call.
 *
 * @param {object} request The Request object, right before getting sent to server
 * @returns request object decorated with either a Bearer authentication token or
 * an X-CSRF-Token header.
 */
const requestInterceptor = (request) => {
  const accessToken = getAccessToken();
  if (accessToken) {
    // eslint-disable-next-line no-param-reassign
    request.headers.Authorization = `Bearer ${accessToken}`;
  } else {
    const csrfToken = localStorage.getItem('csrfToken');
    if (csrfToken) {
      // eslint-disable-next-line no-param-reassign
      request.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return request;
};

const createClient = (endpoint, skipAuthLogic) => {
  const client = axios.create({
    baseURL: endpoint,
  });
  if (!skipAuthLogic) {
    if (process.env.VUE_APP_CLIENT_ID) {
      createAuthRefreshInterceptor(client, refreshAuthLogic);
    }
    client.interceptors.request.use(requestInterceptor);
  }
  return client;
};

/**
 * Log in a user using OAuth user credentials flow.
 *
 * @param {Username} username User's username
 * @param {string} password User's password
 * @returns Promise
 */
async function loginUserCredentials(username, password) {
  return new Promise((resolve, reject) => {
    const data = new FormData();
    data.append('grant_type', 'password');
    data.append('client_id', process.env.VUE_APP_CLIENT_ID);
    data.append('username', username);
    data.append('password', password);
    if (process.env.VUE_APP_CLIENT_SECRET && process.env.VUE_APP_CLIENT_ID.length) {
      data.append('client_secret', process.env.VUE_APP_CLIENT_SECRET);
    }
    if (process.env.VUE_APP_REDIRECT_URI && process.env.VUE_APP_REDIRECT_URI.length) {
      data.append('redirect_uri', process.env.VUE_APP_REDIRECT_URI);
    }

    setAccessToken(null);

    tokenClient.post(oauthEndpoint, data, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
      .then((response) => {
        setAccessToken(response.data.access_token);
        localStorage.setItem('refresh_token', response.data.refresh_token);
        localStorage.setItem('username', username);
        resolve(response);
      })
      .catch((error) => {
        reject(error);
      });
  });
}

if (process.env.VUE_APP_CLIENT_ID) {
  tokenClient = createClient(oauthEndpoint, true);
} else {
  const csrfEndpoint = process.env.VUE_APP_CSRF_TOKEN_ENDPOINT || '/session/token';
  tokenClient = createClient(csrfEndpoint, true);
  tokenClient.get()
    .then((response) => {
      localStorage.setItem('csrfToken', response.data);
    });
}

const logoutUser = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('username');
};

export {
  createClient,
  loginUserCredentials,
  logoutUser,
};
