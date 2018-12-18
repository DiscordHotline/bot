# Discord Hotline Bot

# Getting started

Below are the instructions for getting started with the Discord Hotline bot

### Requirements  

* Docker
* A Text Editor or IDE

### Install

* Fork and Clone this package
* Copy `dev.vault.json.dist` to `dev.vault.json` and put in your dev bot's Discord token.
* Run: `$ docker-compose up -d`
* View the logs with `$ docker-compose logs -f bot`

### To make a plugin

You can copy what is in the CorePlugin. TL;DR:

* Create a npm project with the peer dependencies of: `eris` and `eris-command-framework`
* In **this** project's `package.json`, under `plugins`, add yours. e.g.:
    
    ```json
    {
        "plugins": {
          "CorePlugin": "@hotline/core-plugin",
          "MyAwesomePlugin": "./myAwesomePlugin/"
        }
    }
    ```
    
* Your plugin must exist in index.js and must be a class that extends the `eris-command-framework`'s `AbstractPlugin`. 
