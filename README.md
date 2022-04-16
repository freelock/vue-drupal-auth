# @freelock/vue-drupal-auth

# An authentication handler for developing Vue projects with a Drupal back end

We often use Vue as a front-end toolkit for progressive enhancements on Drupal sites. When developing a front-end application that is decoupled from the back end, you often need to have some sort of authentication in place to be able to access data. OAuth2 / OpenID Connect is the standard way of providing this.

On the other hand, if you bootstrap the Javascript from a Drupal theme or module, you can leverage the user's login session cookie and you don't need to authenticate beyond that -- however if you want to modify any data using Drupal's JSON:API or REST service, if you're using a session cookie, you need to pass a Cross-Site-Request-Forgery (CSRF) token in a header.

This module handles both of these scenarios seamlessly, with a bit of setup.

## What it does

This module is built upon [Axios](https://github.com/axios/axios), a general purpose http request library. We chose Axios because we already use it in many projects, it's a bit of a standard, and it has a feature that native Javascript fetch() lacks -- "interceptors". Using an interceptor, we can easily add a header on every outgoing request. We also leverage [axios-auth-request](https://github.com/Flyrell/axios-auth-refresh), to add an intercepter to catch failed responses and attempt to retry automatically with a refresh token.

To use it, when you need to make an http call, import "createClient" from this module, and call this function (optionally with a base URL for your endpoint) to get an Axios instance that handles the mechanics of the authentication token or CSRV token.

## Set up

### Set up for Session Authentication - CSRF token.

For session authentication, this module requires no authentication (other than being logged into Drupal). All you need to do is import this module, create an Axios object with it, and use that object for your requests and this module will handle the CSRF token for you, when the app loads on your Drupal-generated page. This works for Drupal 8 - 10  by requesting a CSRF token from /session/token, and setting the 'X-CSRF-Token' header on every request used by an Axios client managed by this module.

If you need to specify a different endpoint to retrieve the CSRF token (e.g. for Drupal 7 or other platforms), set this environment variable:

VUE_APP_CSRF_TOKEN_ENDPOINT

Because Vue uses the "dotenv" package and automatically imports variables that start with "VUE_APP_", you can simply put this in a ".env" file in your project root directory:

```
# .env
VUE_APP_CSRF_TOKEN_ENDPOINT=/v1/user/token
```

### Set up for OAuth2/OIDC "password" aka "Client Credentials" flow

This library currently supports the "password" grant type, also known as "Client Credentials" or "Resource Owner" authentication flow.

To support this flow, you do need to set up OAuth2 on your Drupal site. We use [Simple OAuth](https://drupal.org/project/simple_oauth) for this on Drupal 9. You'll need to install this module and create a "consumer" app, along with a corresponding "secret".

Then supply these in environment variables:

```
# env.development
VUE_APP_CLIENT_ID=<client id here -- UUID on list of consumers page>
VUE_APP_CLIENT_SECRET=<client secret for this consumer>
```

If you put these environment variables in a ".env.development" file in your project root, Vue will only load them when in development mode -- e.g. when you are running `npm run serve`, and ignore them when building for production.

This means you can put development settings here and run headless in development, and automatically switch to the CSRF method when your project is built and embedded in Drupal.

### How this module decides what header to add

If there is a VUE_APP_CLIENT_ID defined, this module attempts to use OAuth2/OIDC password and refresh tokens. If not, it attempts to get a CSRF token and use that instead.

It stores these items in your browser's local storage for subsequent requests.

## Environment variables

Here is the full list of environment variables:

- VUE_APP_CLIENT_ID -- if present, use OAuth2 flow. If not present, use CSRF. Set to the Client ID in your back end app -- a UUID if using Drupal Simple OAuth, a name you provide if using Drupal 7 OAuth2 Server.

- VUE_APP_CLIENT_SECRET -- Secret registered in the server. Optional for this library - required for Simple OAuth, optional for Drupal 7.

- VUE_APP_OAUTH_ENDPOINT -- defaults to /oauth/endpoint. Set to /oauth2/endpoint for Drupal 7.

- VUE_APP_REDIRECT_URI -- optional -- may be required by some servers. Is passed as is, if set.

- VUE_APP_CSRF_TOKEN_ENDPOINT -- defaults to /session/token.

## LocalStorage variables

These variables are stored in LocalStorage, and may be accessed by your app:

#### Oauth

- username
- access_token
- refresh_token

#### CSRF

- csrfToken

## How to use this in your code

Aside from getting the Axios client and using that for your requests, for the OAuth flow your user needs to actually log in to the site. With the "password" flow, your app sends the Drupal username and password to the OAuth endpoint with the client id, and gets an access token and refresh token back to use in subsequent requests.

This module provides a `loginUserCredentials(username, password)` function to handle this call, and store the returned tokens which it then uses. Simply import this function and pass credentials you collect from the user, and you're done.

You can use `logoutUser()` to clean up these credentials later.

Note: This library is currently in development -- there is not yet much handling for failures from the server, and it does not currently revoke access tokens on the server -- it simply removes them from local storage.


### Example usage

Here is how we use this with VueX:

```
# env.development
VUE_APP_CLIENT_ID='7476498b-463c-4a5a-aa39-2f23e0de9d27'
VUE_APP_CLIENT_SECRET='averysecretpassword'
```

```
// src/store/index.js
import Vue from 'vue';
import Vuex from 'vuex';
import { mapResourceModules } from '@freelock/reststate-vuex';
import { createClient, loginUserCredentials } from '../auth';

// get a generic Axios client for arbitrary rest calls
const restClient = createClient();

// set this up for working with JSON:API, ready to be passed into @freelock/reststate-vuex
const httpClient = createClient('https://my.site.dev/jsonapi');
httpClient.defaults.headers['Content-Type'] = 'application/vnd.api+json';

Vue.use(Vuex);

export default new Vuex.Store({
  state: {
    ...
  },
  ...
  actions: {
    login(context, credentials) {
      loginUserCredentials(credentials.username, credentials.password);
    },
  },
  modules: {
    // see @freelock/restate-vuex
    ...mapResourceModules({
      httpClient,
      names: [
        'node/article',
        'taxonomy_term/tags',
      ],
    }),
  }
});
```

You'll need to create a login form, and you can import the `loginUserCredentials` in that component directly and call it, or if you're using VueX we usually wrap it in an action that your component can dispatch.

For regular REST calls, you can use restClient.get(), restClient.post(), using standard Axios methods and arguments.


## See also

- [@freelock/reststate-vuex](https://github.com/freelock/reststate-vuex) - convenient library to expose Drupal JSON:API resources directly in VueX, with full CRUD support
