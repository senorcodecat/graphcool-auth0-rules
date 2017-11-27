function generateGraphcoolToken(user, context, callback) {
  var request = require('request');
  var validator = require('validator');

  var gcRootToken = `${configuration.GC_ROOT_TOKEN_1}.${configuration.GC_ROOT_TOKEN_2}.${configuration.GC_ROOT_TOKEN_3}`;
  var gcServiceId = configuration.GC_SERVICE_ID;
  var redirectUrl = configuration.REDIRECT_URL;
  var auth0UserId = user.user_id;

  // Helper function to construct a Graphcool POST request
  function gcRequest(query) {
    return {
      url: `https://api.graph.cool/simple/v1/${gcServiceId}`,
      body: JSON.stringify({query: query}),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gcRootToken}`
      }
    };
  }

  // Helper function to call a Graphcool request then hand over to a callback after checking for errors
  function postGcRequest(query, cb) {
    return request.post(gcRequest(query),
      function(err, resp, body) {
        var result = JSON.parse(body);
        if (result.errors) {
          return callback(new Error(JSON.stringify(result.errors)), user, context);
        } else {
          return cb(result.data);
        }
      });
  }

  // First and foremost, make sure we're not actually coming back to this Rule after a redirect,
  // in which case the user may have explicitly given us their email address. If this is indeed the case...
  if (context.protocol === 'redirect-callback') {
    // Make sure the value passed does contain a valid email address...
    if (!validator.isEmail(context.request.body.email)) {
      return callback(new Error('Missing or invalid email address'), user, context);
    } else {
      // ...and store it for later use
      user.email = context.request.body.email;
    }
  }

  var getUserAuth0IdentityQuery = `query {
    Auth0Identity(auth0UserId: "${auth0UserId}") {
      user {
        id
      }
    }
  }`;

  // Check if Graphcool already has a record of the authenticating user's Auth0 Identity
  postGcRequest(getUserAuth0IdentityQuery,
    function (data) {
      // If we get a result from Graphcool...
      if (data.Auth0Identity) {
        // ...then we know this user has logged in with this Connection before and we're good to go!
        generateAndReturnNodeToken(data.Auth0Identity.user.id);
      } else {
        // Otherwise we have an unknown Auth0 Identity we must attach to a new or an existing Graphcool user.
        // But first, make sure we have a valid email address for the authenticated user, either returned by
        // the authenticating Auth0 Connection or given explicitly by the user after having been redirected.
        if (!user.email) {
          // If we're here, it means that the authenticating Auth0 Connection did not provide us with an email
          // address and that the user has not already been redirected somewhere to ask them for one. We should
          // then redirect the user to explicitly ask them to provide their email address.
          context.redirect = { url: redirectUrl };
          return callback(null, user, context);
        }

        // If we're here then we're sure we've got the user email one way or another! So no, we check if there
        // exists a Graphcool user with this email address and attach the Auth0 Identity to that user. If not,
        // we will create a new Graphcool user altogether and then attach the Auth0 Identity to the created user.
        // In both cases we add the Graphcool token to the response and return!

        var getUserByEmailQuery = `query {
          User(email: "${user.email}") {
            id
          }
        }`;

        return postGcRequest(getUserByEmailQuery,
          function (data) {
            // If we have a Graphcool user with that email address we attach the Auth0 Identity to them
            if (data.User) {
              createAuth0Identity(auth0UserId, data.User.id);
            } else {
              // Otherwise we must create the user first, then attach the Auth0 Identity
              createUserAndAuth0Identity(user.email, auth0UserId);
            }
          });
      }
    });

  // Helper functions start at this point!

  // Create a new Auth0 Identity and attach it to an existing Graphcool user
  function createUserAndAuth0Identity(email, auth0UserId) {
    var createUserMutation = `mutation {
      createUser(email: "${email}") {
        id
      }
    }`;

    return postGcRequest(createUserMutation,
      function (data) {
        createAuth0Identity(auth0UserId, data.createUser.id);
      });
  }

  // Attach a new Auth0 Identity to an existing Graphcool user
  function createAuth0Identity(auth0UserId, userId) {
    var createAuth0IdentityMutation = `mutation {
      createAuth0Identity(auth0UserId: "${auth0UserId}", userId: "${userId}") {
        user {
          id
        }
      }
    }`;

    return postGcRequest(createAuth0IdentityMutation,
      function(data) {
        generateAndReturnNodeToken(data.createAuth0Identity.user.id)
      });
  }

  // Use the Graphcool System API to generate a Node Token for the authenticated user
  // https://www.graph.cool/docs/reference/auth/authentication/authentication-tokens-eip7ahqu5o/#generating-a-node-token-with-the-graphcool-system-api
  function generateAndReturnNodeToken(userId) {

    var generateNodeTokenMutation = `mutation {
      generateNodeToken(input: {
        rootToken: "${gcRootToken}",
        serviceId: "${gcServiceId}",
        nodeId: "${userId}",
        modelName: "User",
        clientMutationId: ""
      }) {
        token
      }
    }`;

    return request.post({
        url: 'https://api.graph.cool/system',
        body: JSON.stringify({query: generateNodeTokenMutation}),
        headers: {'Content-Type': 'application/json'}
      },
      function(err, resp, body) {
        var result = JSON.parse(body);
        if (result.errors) {
          return callback(new Error(JSON.stringify(result.errors)), user, context);
        } else {
          context.idToken['https://graph.cool/token'] = result.data.generateNodeToken.token;
          callback(null, user, context);
        }
      });
  }
}
