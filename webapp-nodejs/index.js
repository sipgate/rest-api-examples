const queryString = require('querystring');
const express = require('express');
const session = require('express-session');
const request = require('request-promise-native');
const createApiClient = require('sipgate-rest-api-client').default;

// sipgate REST API settings
const apiUrl = 'https://api.sipgate.com/v2';
const desiredScope = 'balance:read';
const clientId = process.env.npm_config_client_id;
const clientSecret = process.env.npm_config_client_secret;

if (!clientId || clientId === 'CLIENT_ID' || !clientSecret || clientSecret === 'CLIENT_SECRET') {
  console.log('Please provide a client id and secret in this project .npmrc file.');
  process.exit(1);
}

// URL constants
const port = process.env.npm_config_port;
const appUrl = `http://localhost:${port}`;
const authPath = '/authorize';
const authRedirectUrl = `${appUrl}${authPath}`;
const authUrl = `https://api.sipgate.com/login/third-party/protocol/openid-connect`;
const apiAuthUrl = `${authUrl}/auth?` + queryString.stringify({
    client_id: clientId,
    redirect_uri: authRedirectUrl,
    scope: desiredScope,
    response_type: 'code',
  });


// Initialize express app
const app = express();
app.use(session({
  secret: 'sipgate-rest-api-demo',
  cookie: { maxAge: 60000 },
  resave: false,
  saveUninitialized: false
}));

app.get('/', function (req, res) {
  const accessToken = req.session['accessToken'];

  if (!accessToken) {
    res.redirect(authPath);
    return;
  }

  const apiClient = createApiClient(apiUrl, accessToken);
  apiClient.getBalance()
    .then(function (response) {
      if (!(response['amount'] && response['currency'])) {
        throw 'Malformed response';
      }

      const balanceFormatted = (parseInt(response['amount'], 10) / 10000).toFixed(2);
      res.send(`Your sipgate account balance is ${balanceFormatted} ${response['currency']}.`);
    })
    .catch(function(reason) {
      if (reason === 'Unauthorized') {
        res.redirect(authPath);
        return;
      }
      res.send('Sorry, something went wrong. Please try again.');
    });
});

const fetchToken = function(url, authorizationCode) {
  console.log({ url, authorizationCode });
  return request.post({
    url,
    form: {
      client_id: clientId,
      client_secret: clientSecret,
      code: authorizationCode,
      redirect_uri: authRedirectUrl,
      grant_type: 'authorization_code',
    },
    simple: false,
    resolveWithFullResponse: true,
  })
  .then(function(response) {
    console.log('status', response.statusCode);
    if ([307, 308].includes(response.statusCode)) {
      return fetchToken(response.headers['location'], authorizationCode);
    }
    return response;
  })
};

app.get(authPath, function (req, res) {

  const authorizationCode = req.query.code;

  if (!authorizationCode) {
    console.log("Not authenticated yet! Redirecting to " + apiAuthUrl);
    res.redirect(apiAuthUrl);
    return;
  }

  console.log("Got authorization code: " + authorizationCode);

  fetchToken(`${authUrl}/token`, authorizationCode)
    .then(function (response) {
      const body =  response.body;
      const payload = JSON.parse(body);
      console.log("Got authorization data", payload)
      req.session['accessToken'] = payload['access_token'];
      res.redirect('/');
    })
    .catch(function (e) {
      console.log("Error getting access_token", e);
      res.redirect(apiAuthUrl);
    });
});

app.listen(port, function () {
  console.log(`Listening on port ${port}. Open ${appUrl} in your browser.`);
});
