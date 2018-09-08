"use-strict"

const kinveyFlexSDK = require('kinvey-flex-sdk');
const {
    graphql,
    GraphQLSchema,
    GraphQLObjectType,
    GraphQLString,
    GraphQLNonNull,
} = require('graphql');

let references = {
    modules: null,
    flex: null
};

const promisify = function (foo) {
    return new Promise(function (resolve, reject) {
        foo(function (error, result) {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
};

const getGreeting = function (firstName) {
    return promisify(function (callback) {
        return references.modules.dataStore().collection('NicknamesCollection')
            .find(new references.modules.Query().equalTo('firstName', firstName), callback);
    })
        .then(function (result) {
            if (result[0]) {
                return result[0].nickname;
            } else {
                return firstName;
            }
        })
        .then(function (passedName) {
            return `Hello ${passedName}!`;
        })
        .catch(function (error) {
            references.flex.logger.error(error);
        });
};

const changeNickname = function (firstName, nickname) {
    return promisify(function (callback) {
        return references.modules.dataStore().collection('NicknamesCollection')
            .find(new references.modules.Query().equalTo('firstName', firstName), callback);
    })
        .then(function (result) {
            if (result[0]) {
                // Found. Change.
                result[0].nickname = nickname;
                return promisify(function (callback) {
                    return references.modules.dataStore().collection('NicknamesCollection')
                        .save(result[0], callback);
                });
            } else {
                // Not found. Create.
                return promisify(function (callback) {
                    return references.modules.dataStore().collection('NicknamesCollection')
                        .save({ firstName: firstName, nickname: nickname }, callback);
                });
            }
        })
        .then(function (savedResult) {
            return savedResult.nickname;
        })
        .catch(function (error) {
            references.flex.logger.error(error);
        });
};

const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
        name: 'RootQueryType',
        fields: {
            greeting: {
                args: { firstName: { name: 'firstName', type: new GraphQLNonNull(GraphQLString) } },
                type: GraphQLString,
                resolve (parent, args) {
                    return getGreeting(args.firstName);
                }
            }
        }
    }),
    mutation: new GraphQLObjectType({
        name: 'RootMutationType',
        fields: {
            changeNickname: {
                args: {
                    firstName: { name: 'firstName', type: new GraphQLNonNull(GraphQLString) },
                    nickname: { name: 'nickname', type: new GraphQLNonNull(GraphQLString) }
                },
                type: GraphQLString,
                resolve (parent, args) {
                    return changeNickname(args.firstName, args.nickname);
                }
            }
        }
    })
});

kinveyFlexSDK.service((err, flex) => {
    if (err) {
        console.log("Error while initializing Flex!");
        return;
    }

    // Set the "flex" reference for future usage.
    if (!references.flex) {
        references.flex = flex;
    }

    flex.functions.register("query", function (context, complete, modules) {
        // Set the "modules" reference for future usage.
        if (!references.modules) {
            references.modules = modules;
        }

        return graphql(schema, context.query.query)
            .then(function (result) {
                return complete().setBody(result).ok().next();
            }, function (error) {
                return complete().setBody(error).runtimeError().done();
            });
    });
});