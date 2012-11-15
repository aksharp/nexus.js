(function($, obj){

    var nexus = {
        scope: {
            specificNameOnSingleThread: 'specificNameOnSingleThread',
            specificNameOnAllThreads: 'specificNameOnAllThreads',
            allOnSingleThread: 'allOnSingleThread',
            allOnAllThreads: 'allOnAllThreads'
        },
        eventType: 'EVENT',
        commandType: 'COMMAND',
        createBus: function(){
            var bus = function(){
                var self = this;
                self.specificNameOnSingleThreadHandlers = [];
                self.specificNameOnAllThreadsHandlers = [];
                self.allOnSingleThreadHandlers = [];
                self.allOnAllThreadsHandlers = [];
                self.scopedHandlers = [
                    {scope: nexus.scope.specificNameOnSingleThread, handlers: self.specificNameOnSingleThreadHandlers},
                    {scope: nexus.scope.specificNameOnAllThreads, handlers: self.specificNameOnAllThreadsHandlers},
                    {scope: nexus.scope.allOnSingleThread, handlers: self.allOnSingleThreadHandlers},
                    {scope: nexus.scope.allOnAllThreads, handlers: self.allOnAllThreadsHandlers}
                ];
                self.scopedHandlerRegisterMethods = [
                    {
                        scopes: [nexus.scope.specificNameOnSingleThread, nexus.scope.allOnSingleThread],
                        register: function(handlerToRegister, registeredHandlers){
                            var alreadyRegistered = false;
                            registeredHandlers.map(function(registeredHandler){
                                if(handlerToRegister.id === registeredHandler.id
                                    && handlerToRegister.threadId === registeredHandler.threadId){
                                    alreadyRegistered = true;
                                }
                            });
                            if (!alreadyRegistered){
                                registeredHandlers.push(handlerToRegister);
                            }
                        }
                    },
                    {
                        scopes: [nexus.scope.specificNameOnAllThreads, nexus.scope.allOnAllThreads],
                        register: function(handlerToRegister, registeredHandlers){
                            var alreadyRegistered = false;
                            registeredHandlers.map(function(registeredHandler){
                                if(handlerToRegister.id === registeredHandler.id){
                                    alreadyRegistered = true;
                                }
                            });
                            if (!alreadyRegistered){
                                registeredHandlers.push(handlerToRegister);
                            }
                        }
                    }
                ];
                self.queue = {
                    processedSequences: [],
                    storage: [],
                    push: function(obj){
                        self.queue.storage.push(obj);
                        self.queue.process();
                    },
                    next: function(){
                        return self.queue.storage.shift();
                    },
                    hasNext: function(){
                        return self.queue.storage.length;
                    },
                    isPromise: function(obj){
                        return obj.hasOwnProperty('done') && obj.hasOwnProperty('then');
                    },
                    process: function(){
                        if (self.queue.hasNext()){
                            var next = self.queue.next(),
                                promise = next.handler.handle(next.message);

                            if (promise && self.queue.isPromise(promise)){
                                promise.done(function(){
                                    next.deferred.resolve();
                                });
                            }else{
                                next.deferred.resolve();
                            }
                            self.queue.process();
                        }
                    }
                };
                self.send = function(message){
                    var promises = [],
                        pushToQueue = function(message, handler){
                            var deferred = $.Deferred();
                            self.queue.push({
                                message: message,
                                handler: handler,
                                deferred: deferred
                            });
                            promises.push(deferred.promise());
                        };

                    self.allOnSingleThreadHandlers.map(function(handler){
                        if (handler.threadId === message.threadId){
                            pushToQueue(message, handler);
                        }
                    });
                    self.specificNameOnSingleThreadHandlers.map(function(handler){
                        if (handler.threadId === message.threadId && handler.handles === message.name){
                            pushToQueue(message, handler);
                        }
                    });
                    self.allOnAllThreadsHandlers.map(function(handler){
                        pushToQueue(message, handler);
                    });
                    self.specificNameOnAllThreadsHandlers.map(function(handler){
                        if (handler.handles === message.name){
                            pushToQueue(message, handler);
                        }
                    });
                    return promises;
                };
                self.register = function(handler){
                    handler.scope = handler.scope || nexus.scope.specificNameOnSingleThread;
                    self.scopedHandlers.map(function(scopedHandler){
                        if (scopedHandler.scope == handler.scope){
                            self.scopedHandlerRegisterMethods.map(function(scopedHandlerRegisterMethod){
                                if (scopedHandlerRegisterMethod.scopes.indexOf(scopedHandler.scope) != -1){
                                    scopedHandlerRegisterMethod.register(handler, scopedHandler.handlers);
                                }
                            });
                        }
                    });
                };
                self.isRegistered = function(handler){
                    var registered = false;
                    self.scopedHandlers.map(function(registered){
                        registered.handlers.map(function(registeredHandler){
                            if (registeredHandler.id === handler.id){
                                registered = true;
                            }
                        });
                    });
                    return registered;
                };
                self.hasHandler = function(name){
                    var handlers = self.specificNameOnSingleThreadHandlers.concat(self.specificNameOnAllThreadsHandlers),
                        i, l;
                    for (i= 0, l=handlers.length; i < l; i++){
                        if (handlers[i].handles == name){
                            return true;
                        }
                    }
                    return false;
                }
            };
            return new bus();
        },
        newId: function() {
            var f = function(){
                return (((1+Math.random())*0x10000)|0)
                    .toString(16)
                    .substring(1);
            };
            var s = "_";
            return f()+f()+s+f()+s+f()+s+f()+s+f()+f()+f();
        },
        bind: function(message){
            if (arguments.length === 2){
                if ($.isArray(arguments[1])){
                    var handles = arguments[0];
                    var handlers = arguments[1];
                    handlers.map(function(handler){
                        nexus.bind({
                            handles: handles,
                            handle: handler
                        });
                    });
                }else{
                    nexus.bind({
                        handles: arguments[0],
                        handle: arguments[1]
                    });
                }
            }else{
                if ($.isArray(arguments[0])){
                    arguments[0].map(function(message){
                        for (var name in message){
                            var action = message[name];
                            nexus.bind(name, action);
                        }
                    });
                }else{
                    if (!message.id){
                        message.id = nexus.newId();
                    }
                    if (!message.scope){
                        message.scope = nexus.scope.specificNameOnAllThreads;
                    }
                    nexus.bus.register(message);
                }
            }
        },
        unbind: function(id, scope){
            if (id){
                var scopedHandlers = [
                    {scope: nexus.scope.specificNameOnSingleThread, handlers: nexus.bus.specificNameOnSingleThreadHandlers},
                    {scope: nexus.scope.specificNameOnAllThreads, handlers: nexus.bus.specificNameOnAllThreadsHandlers},
                    {scope: nexus.scope.allOnSingleThread, handlers: nexus.bus.allOnSingleThreadHandlers},
                    {scope: nexus.scope.allOnAllThreads, handlers: nexus.bus.allOnAllThreadsHandlers}
                ];
                var unbinder = function(){
                    this.unbind = function(id){
                        for (var i = 0, size = this.handlers.length; i < size; i++){
                            if (this.handlers[i].id == id){
                                this.handlers.splice(i,1);
                                return;
                            }
                        }
                    };
                    this.from = function(handlers){
                        this.handlers = handlers;
                        return this;
                    }
                };
                if (scope){
                    scopedHandlers.map(function(scoped){
                        if (scoped.scope == scope){
                            new unbinder().from(scoped.handlers).unbind(id);
                        }
                    });
                }else{
                    scopedHandlers.map(function(scoped){
                        new unbinder().from(scoped.handlers).unbind(id);
                    });
                }
            }
        },
        sendMessage: function(name, model, options){
            options = options || {};
            var threadId = options.threadId || nexus.mainThreadId,
                type = options.type || '',
                message = {
                    name: name,
                    model: model || {},
                    type: type,
                    threadId: threadId,
                    sendMessage: function(name, model){
                        return nexus.sendMessage(name, model, {
                            threadId: threadId,
                            type: type
                        });
                    },
                    publishEvent: function(name, model){
                        return nexus.sendMessage(name, model, {
                            threadId: threadId,
                            type: nexus.eventType
                        });
                    },
                    dispatchCommand: function(name, model){
                        return nexus.sendMessage(name, model, {
                            threadId: threadId,
                            type: nexus.commandType
                        });
                    }
                };
            var deferred = $.Deferred();
            $.when.apply($, nexus.bus.send(message)).then(function(){
                deferred.resolve(message);
            });
            return deferred.promise();
        },
        publishEvent: function(name, model, options){
            options = options || {};
            options.type = nexus.eventType;
            return nexus.sendMessage(name, model, options);
        },
        dispatchCommand: function(name, model, options){
            options = options || {};
            options.type = nexus.commandType;
            return nexus.sendMessage(name, model, options);
        }
    };

    nexus.mainThreadId = nexus.newId();
    nexus.bus = nexus.createBus();
    obj.nexus = nexus;

})(jQuery, window);