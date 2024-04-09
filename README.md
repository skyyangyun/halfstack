# Halfstack 半栈

HalfStack is a backend framework based on Deno, which helps developers quickly build API services or backend applications using the JavaScript language.

半栈是一个基于 Deno 的后端框架，能够帮助开发者使用JavaScript语言快速构建API服务或后端应用

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
Half-stack has built-in OpenAPI, which can easily generate API documents. When starting OpenAPI with default parameters, you can view the API documents by visiting http://localhost:8000/

半栈内置了OpenAPI，可以方便的生成API文档，当使用默认参数启动OpenAPI时，可以通过访问 http://localhost:8000/ 来查看API文档
