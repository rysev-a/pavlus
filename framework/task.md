# pavlus framework

## 1. create template engine for JS apps, like slim, pug style

```

body
  header
    nav.top-menu
      ul
        for item in topMenuItems:
          li.top-menu__item
            a.top-menu__link(href={item.url}) {item.title}

  main
    h1.header-1#page-title Pavlus framework

    div.tabs
      div.tabs-menu
        for tab in tabs:
          a.tabs-menu__item(onclick=switchTab) {tab.title}
      div.tabs-content
        {tab.content()} // - as element

```

in template use

- text variables
- attribute variables
- event variables
- loops
- conditions
- comments

parse templates to typescript structure on compile time in vite by plugin

## 2. Dom mount, unmount and update

2.1 Mount is simple thing, i just need to render template to dom and add event listeners, also i need to store my event listeners to global event listener registry for unmounting and updating

2.2 Unmount is more trickie thing, i need to remove all events listeners and accurately remove dom node, also i need to remove all nested components and their event listeners recursively

2.3 Update is the most complex and hard thing

When i update simple attribute, or variable this is easy. The most complex thing is when some variables are dependent on another

Example:

```
div.dashboard
  h1.dashboard-title Admin panel dashboard
  if showUsers
    div.users
      h2 Users
      ul.users__list
        for user in users:
          if user.isVisible
            li.users__item
              a.users__item-link(href=user.url)
                | span.users__item-remove(onclick=removeUser(user))
                | {user.name}

  if showShop
    div.shop-menu
      h1 Shop menu
    div.shop-menu__users

    div.shop-menu__products
```

What happens when i update users array? This depends on is showUsers is true or false. If showUsers is true, users list will be updated, if false - nothing will happen.

But what happens when removeUser is changed? I pass removeUser function to template, so it will be updated when removeUser changes. This is dependent on showUsers value.

Also if user.isVisible is false, i don't need to update dom node with hidden user.

When i parse template i have template structure with all variables, i can compute how is dom will be updated if change any variable. I can construct graph with variables dependencies and calculate what nodes will be updated when change any variable.

But what if i get showUsers is true and users data? Need i mount users list or update it? This is dependent on showUsers prev value, that's why when i use mount, i need only current state and template structure, but when i use update or unmount, i need prev state and current state.

Common idea is when i compile template, i can compute all scenarios for all variables and create pure function, that's get current state, prev state and can return all required dom updates.

## 3. Core and plugins

Central idea of pavlus framework is 100% pure functional client code and dirty work in plugins, like DOM manipulation, http requests, store management, get current Datetime, logs, URL routing and history management.

Framework core get 100% pure functional application code, that's just simple function this input and output. App code get message and return array of effect, core pass effect to plugins and plugins make some side effects.

For example app get message with {id: 'init'}, application return https effects to load initial data from server, then http plugin send request to server, get data and pass data to core, core pass message to app, then app return DOM effects and core pass it to DOM plugin, DOM plugin update dom and create event listeners, on click event listener messages are sent to core and to application

3.1 Dom plugin - get dom effects, like mount, update, unmount, focus on input and etc. Also dom plugin has some state management, for example my component is

```
div.user-info
  input(type='email' onInput=onEmailInput)
```

if i update onEmailInput, i need to find previous eventListener to remove it and add new one

When i unmount component, i need to remove all event listeners

3.2 Store plugin - get store effects and update store, also store memoize all state changes by array with {timestamp: ..., effect: ..., restoreEffect: ...}, and what is restore? Restore is effect that apply to store to restore previous state.

For example i have store {user: {email: 'test@test.com'}}, and then i run effect {user: null}, this effect just remove all user data from store. But restoreEffect is effect that apply to store to restore previous state, for example {user: {email: 'test@test.com'}}

3.3 Http plugin - get http effects and send http requests, also all http requests can be cancelled and http plugin store all http requests and their states with id. When user core create http effect, ID for request is required, and if http plugin get http effect with same ID, it will cancel previous request and send new one, or if http effect this same id and action: 'cancel', it will cancel request with this id.

3.4 WebSocket plugin - store all WebSocket connections and their states with id, also can send and receive messages from WebSocket connections.

3.5 Time plugin - get time effects to get current time and date, and also to setInterval and clearInterval, or setTimeout and clearTimeout. This plugin is all about time effects and date, this is have state to store all setInterval and setTimeout IDs and can cancel all setInterval and setTimeout. For example user input some filter search, application code use setTimeout to delay search request until user stop typing, while user is still typing, previous search request will be cancelled ty send effect with action: 'cancel' and id for find interval.

3.6 Logger plugin - just get log effects and log messages to console.

3.* - Any other plugin for service worker, canvas, audio, geolocation and other side effectful functions. Plugin should have strong typing interface and any programmer should be able to implement it's own plugin without any problem

4. ## Application code

Application code is always 100% pure function with no side effects and 100% deterministic with same input always produce same output, in application code user can't use Math.random() or Date.now() or any other side effectful functions.

Also application code has hierarchy of components.

First message go to main component, and main component can pass event to child components or not, all child components also has their child components, and decide what go to down to child components and what is their own logic.

Also parent components can update or change some message, add new data or change message ID, payload, also parent component can update, filtering and transforming output effects. This is always ability to create wrapper arount any component that can for example add logging, or additional http requests for some tracking, or any other logging

Parent components always know about child components, but child components never know about their parent components, they known only about input message and output effects.
