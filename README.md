# Halfstack 半栈

HalfStack is an out-of-the-box backend framework developed on top of Deno.
Can help developers quickly build API services or back-end applications using JavaScript language

半栈是一个开箱即用的后端框架，它基于 Deno 开发。能够帮助开发者使用JavaScript语言快速构建API服务或后端应用

## Install 安装

Require Deno

需要安装 Deno

```javascript
import Halfstack from 'halfstack'
```

## Usage 用法

```javascript
import Halfstack from 'halfstack'

const app = new Halfstack()
app.addRoute({ path: '/greet' , method: 'GET' }, () => {
    return {
        message: 'Hello World',
        date: new Date(),
    }
})

await app.listen() 
/* Listening on http://localhost:8000/ */
```

## Introduction 介绍
Halfstack has built-in OpenAPI, which can easily generate API documents.
When starting OpenAPI with default parameters, you can view the API documents by visiting http://localhost:8000/

半栈内置了OpenAPI，可以方便的生成API文档，当使用默认参数启动OpenAPI时，可以通过访问 http://localhost:8000/ 来查看API文档

## 对比其他框架
### Oak
Oak 是 Deno 生态中最流行的轻量级中间件框架，同时也是我在创造该项目前最为喜爱的 Deno 框架。它的中间件设计可以方便使用者快速插入各种各样的中间件。

但对比起开箱即用的 Halfstack 来说，Oak 需要开发者自己配置安装的插件太多了。你需要自己组装一系列的中间件才能得到一个适用开发的服务器框架。
而 Halfstack 提供了强大且开箱即用功能。路由、OpenAPI文档，可以让开发者立刻专注于构建他们自己的应用，而不用去关心自己手上的工具是否完善。

在 Oak 中，路由器也作为一种特殊的中间件，官方提供了 oak/router 来供开发者作为路由器使用。

而在 Halfstack 中，路由器并不是作为中间件插入框架中的，而是作为框架核心的一部分，可以让开发者直接由路由搭建应用程序。

### Koa / Express


Koa 和 Express 都是 Node.js 生态中最流行的 Web 框架。 Halfstack 中也有一些思想借鉴了这两个优秀的框架。

Halfstack 目前还处于成长阶段。无论是在主要功能还是插件生态方面，都远不及 Koa 和 Express 这些框架丰富。但 Halfstack 仍然有一些值得称道的特性。


