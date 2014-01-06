'use strict';

/* Constants */
var AWS_CloudFormation_Stack = 'AWS::CloudFormation::Stack';

/* Controllers */

var cloudviewApp = angular.module('cloudviewApp', [
]);

cloudviewApp.controller('CloudviewCtrl', function($scope, $http, $q)
{
    $scope.loadStack = function()
    {
        if ($scope.templateUrl) {
            loadStackTemplateFromUrl($scope.templateUrl).then(function(result) {
                $scope.stackTemplate = result;
                $scope.updateStackFromTemplate();
            });
        }
    };

    $scope.updateStackFromTemplate = function()
    {
        loadStackFromTemplate($scope.stackTemplate).then(function(result) {
            $scope.stack = result;
        });
    };

    $scope.jsonStringify = function(obj)
    {
        var cache = [];
        var str = JSON.stringify(obj, function(key, value) {
            if (typeof value === 'object' && value !== null) {
                if (cache.indexOf(value) !== -1) {
                    // Circular reference found, discard key
                    return '[Circular]';
                }
                // Store value in our collection
                cache.push(value);
            }
            return value;
        }, 4);
        return str;
    };

    var isEmpty = function(obj)
    {
        return !obj || angular.equals(obj, {});
    };

    // Expose isEmpty.
    $scope.isEmpty  = isEmpty;

    var loadStackTemplateFromUrl = function(templateUrl)
    {
        var deferred = $q.defer();

        if (templateUrl) {
            $http.get(templateUrl).success(function(data) {
                deferred.resolve(data);
            });
        }
        else {
            deferred.resolve(false);
        }

        return deferred.promise;
    };

    var loadStackFromTemplate = function(stackTemplate)
    {
        var deferred = $q.defer();

        var stack = {};

        // Load params.
        stack.Parameters = loadStackParameters(stackTemplate, stack);

        // Load resources.
        loadStackResources(stackTemplate, stack).then(function(result) {
            stack.Resources = result;
            deferred.resolve(stack);
        });

        return deferred.promise;
    };

    var loadStackParameters = function(stackTemplate, stack)
    {
        var parameters = {};
        if (stackTemplate.Parameters) {
            angular.forEach(stackTemplate.Parameters, function(param, paramName) {
                if (param.Default && !param.Value) {
                    // Set param default value.
                    param.Value = param.Default;
                }
                parameters[paramName] = param;
            }, stack);
        }

        return parameters;
    };

    var loadStackResources = function(stackTemplate, stack)
    {
        var resources = {};
        var resourcePromises = {};
        var resourceRefs;
        var resourceDependencies;
        var dependencyPromises;

        var getAllResourceRefs = function(obj, refs)
        {
            if ('undefined' === typeof refs) {
                refs = [];
            }

            if (!angular.isObject(obj)) {
                return refs;
            }
            else {
                angular.forEach(obj, function(value, key) {
                    if (angular.isObject(value)) {
                        if ('undefined' !== typeof value.Ref) {
                            refs.push(value.Ref);
                        }
                        else {
                            // concat sub-object refs if any.
                            refs = getAllResourceRefs(value, refs);
                        }
                    }
                });
            }

            return refs;
        };


        var isResourceRefsMet = function(resource, parameters, resources)
        {
            var refs = getAllResourceRefs(resource);

            var allMet = true;
            var isMet;

            angular.forEach(refs, function(ref) {
                isMet = resolveStackRef(ref, parameters, resources);
                allMet = allMet && isMet;
            });

            return allMet;
        };

        var loadResource = function(resource, resourceName)
        {
            var deferred = $q.defer();

            if (resource.Type === AWS_CloudFormation_Stack) {
                // Load from template URL is asynchronous & recursive.
                loadStackTemplateFromUrl( resolveResourceProperty(resource, 'TemplateURL', stack) ).then(function(result) {
                    resource.StackTemplate = result;
                    if (result) {
                        // Template loaded, now load the sub-stack as a resource.
                        loadStackFromTemplate(resource.StackTemplate).then(function(result) {
                            resource.Stack = result;
                            deferred.resolve(resource);
                        });
                    }
                    else {
                        // Template failed to load (todo: reject promise).
                        resource.Stack = null;
                        deferred.resolve(resource);
                    }
                });
            }
            else {
                deferred.resolve(resource);
            }

            return deferred.promise;
        };

        if (stackTemplate.Resources) {
            // Process all resources (create a depency map of promises).
            var resourcesToLoad = angular.copy(stackTemplate.Resources);

            // Loop over resources for as long as it takes to build a web of promises.
            var numResourcesToLoad;
            do {
                // Get the number of resources to load. If none are loaded after each loop then throw.
                numResourcesToLoad = Object.keys(resourcesToLoad).length;

                angular.forEach(resourcesToLoad, function(resource, resourceName) {
                    // Check resource requirements (refs to resolve).
                    resourceRefs = getAllResourceRefs(resource);

                    if (0 === resourceRefs.length) {
                        // No dependencies, load now (or at least get a promise to that affect).
                        resourcePromises[resourceName] = loadResource(resource, resourceName);
                        delete resourcesToLoad[resourceName];
                    }
                    else {
                        // Can't load until dependencies are met, so find which Refs are dependent
                        // on another resource, and gather up their promises.
                        resourceDependencies = [];
                        angular.forEach(resourceRefs, function(ref)
                        {
                            if (ref && (typeof stackTemplate.Resources[ref] !== 'undefined')) {
                                // This is a ref to another resource in the stack, so it's a 
                                // dependency.
                                resourceDependencies.push(ref);
                            }
                        });

                        if (0 === resourceDependencies.length) {
                            // Not dependent on any other resources (all refs must be parameters, load now, as above).
                            resourcePromises[resourceName] = loadResource(resource, resourceName);
                            delete resourcesToLoad[resourceName];
                        }
                        else {
                            // This resource is dependent on 1 or more other resources, check if
                            // their promises are in. Build a list of all the promises.
                            dependencyPromises = {};
                            angular.forEach(resourceDependencies, function(dep) {
                                if (typeof resourcePromises[dep] !== 'undefined') {
                                    dependencyPromises[dep] = resourcePromises[dep];
                                }
                            });

                            // Check if all the promises are in.
                            if (Object.keys(dependencyPromises).length === resourceDependencies.length) {
                                // Defer this loading until resources are met.
                                var deferred = $q.defer();
                                resourcePromises[resourceName] = deferred.promise;
                                // Create a single promise for the dependencies.
                                $q.all(dependencyPromises).then(function(results) {
                                    // Once all dependencies are met, load this resource.
                                    loadResource(resource, resourceName).then(function(result)
                                    {
                                        // TODO: Replace the Refs within result Refs.
                                        result.Refs = results;
                                        // And pass my result back up to resolve my promise.
                                        deferred.resolve(result);
                                    });
                                });
                                delete resourcesToLoad[resourceName];
                            }
                            // else, wait on next loop to see if more promises are made.
                        }
                    }
                });

                if (Object.keys(resourcesToLoad).length === numResourcesToLoad) {
                    throw "Couldn't resolve resource dependencies";
                }
            } while (!isEmpty(resourcesToLoad));
        }

        // Combine all resource promises into a single promise for this function.
        return $q.all(resourcePromises);
    };

    var resolveResourceProperty = function(resource, propertyName, stack, resources)
    {
        if (!resource.Properties || ('undefined' === typeof resource.Properties[propertyName])) {
            return null;
        }

        var property = resource.Properties[propertyName];

        if (angular.isString(property)) {
            return property;
        }
        else if (angular.isObject(property)) {
            if (typeof property.Ref !== 'undefined') {
                // Property is a { Ref : something }.
                return resolveStackRef(property.Ref, stack.Parameters, resources);
            }
            else {
                return property;
            }
        }
    };

    var resolveStackRef = function(ref, parameters, resources)
    {
        // Check Parameters.
        if (parameters && parameters[ref]) {
            return parameters[ref].Value;
        }
        // Check Resources.
        else if (resources && resources[ref]) {
            return resources[ref];
        }
        else {
            return null;
        }
    };

    // Load on init.
    $scope.loadStack();
});

/* Services */

/*
var cloudviewServices = angular.module('cloudviewServices', ['ngResource']);

cloudviewServices.factory('CloudStack', ['$resource',
    function($resource) {
        return {};
        /*
        return $resource(':templateUrl', {} {
            query: {method:'GET', isArray:true}
        });
        * /
    }]);
*/
