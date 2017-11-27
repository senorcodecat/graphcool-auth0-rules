# Graphcool Auth0 Rules

This repository contains [Auth0 Rules](https://auth0.com/docs/rules) written in Javascript. Deployments can be setup according to Auth0's [Github Deployments](https://auth0.com/docs/extensions/github-deploy) instructions.

## Generate Graphcool Token

This Rule creates a new Graphcool user or adds a new Auth0 Connection to an existing user (if, for instance, the user logs in using Facebook after they've already logged in using Google) after they have successfully authenticated using Auth0. It also generates a [Graphcool Node Token](https://www.graph.cool/docs/reference/auth/authentication/authentication-tokens-eip7ahqu5o#node-tokens) using the [Graphcool System API](https://www.graph.cool/docs/reference/auth/authentication/authentication-tokens-eip7ahqu5o#generating-a-node-token-with-the-graphcool-system-api) and adds it to Auth0's generated `idToken` during user authentication.

Note that this rule manages the user identity using their email address; this way the same user may use multiple [Auth0 Connections](https://auth0.com/docs/connections) to login, and this Rule keeps track of those "identities" within the Graphcool schema itself:

```graphql schema
type User @model {
  id: ID! @isUnique
  identities: [Auth0Identity!]! @relation(name: "UserAuth0Identity")
}

type Auth0Identity @model {
  id: ID! @isUnique
  auth0UserId: String! @isUnique
  user: User @relation(name: "UserAuth0Identity")
}
```

The rule works by checking whether or not the Auth0 Connection used by the user to authenticate is already known to Graphcool. If it is, we generate a Graphcool Node Token and attach it to the Auth0 `idtoken` returned.

Otherwise, if this is the first time the user is authenticated using this Auth0 Connection, we first make sure that Auth0 Connection returned an email address. If not, we redirect him to a form to collect their email address and redirect back to the rule. This form must be created and hosted by your service.
 
Finally we continue the process of storing the Auth0 Identity by either adding it to an existing user if the email address was known or by creating a new user first.

The source code is extensively documented for more details.  

This Rule requires the following [Configuration Objects](https://auth0.com/docs/rules/current#using-the-configuration-object):
* `GC_ROOT_TOKEN_1`, `GC_ROOT_TOKEN_2`, `GC_ROOT_TOKEN_3`: https://www.graph.cool/docs/reference/auth/authentication/authentication-tokens-eip7ahqu5o#root-tokens
* `GC_SERVICE_ID`: https://www.graph.cool/docs/reference/graphcool-cli/.graphcoolrc-zoug8seen4#overview
* `REDIRECT_URL`: the URL the user will be redirected to if the connection used to authenticate them did not provide an email address

**Note**: I'm not sure if that's still the case, but I remember that the maximum length of the Configuration Objects in Auth0 was 255. This is why the Graphcool Token above is split into 3 parts.
