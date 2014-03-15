'use strict';

// TODO: Resolve Ref values (parameters need to be resolved for sub-sub stacks to load).

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
            // Entire stack is loaded, pass to scope for binding.
            $scope.mainStack = result;
            $scope.mainStackName = 'full stack';
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

    var loadStackFromTemplate = function(stackTemplate, parameters)
    {
        var deferred = $q.defer();

        var stack = {};

        // Load params from template & parameters passed in.
        stack.Parameters = loadStackParameters(stackTemplate, parameters);

        // Load resources.
        loadStackResources(stackTemplate, stack).then(function(result) {
            stack.Resources = result;
            deferred.resolve(stack);
        });

        return deferred.promise;
    };

    var loadStackParameters = function(stackTemplate, parameters)
    {
        var loadedParameters = {};
        if (stackTemplate.Parameters) {
            angular.forEach(stackTemplate.Parameters, function(param, paramName) {
                // Set Value on param.
                if (!param.Value) {
                    if (parameters && parameters[paramName] && parameters[paramName].Value) {
                        param.Value = parameters[paramName].Value;
                    }
                    else if (param.Default) {
                        // Set param default value.
                        param.Value = param.Default;
                    }
                }
                loadedParameters[paramName] = param;
            });
        }

        return loadedParameters;
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
                refs = {};
            }

            if (!angular.isObject(obj)) {
                return refs;
            }
            else {
                angular.forEach(obj, function(value, key) {
                    if (angular.isObject(value)) {
                        if ('undefined' !== typeof value.Ref) {
                            refs[value.Ref] = value;
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
            var refs = Object.keys(getAllResourceRefs(resource));

            var allMet = true;
            var isMet;

            angular.forEach(refs, function(ref) {
                isMet = resolveStackRef(ref, parameters, resources);
                allMet = allMet && isMet;
            });

            return allMet;
        };

        var resolveResourcesParams = function(resources, parameters)
        {
            angular.forEach(resources, function(resource, resourceName) {
                var refs = Object.keys(getAllResourceRefs(resource));
                angular.forEach(refs, function(ref) {
                    resource[ref] = resolveStackRef(ref, parameters);
                });
            });
        };

        var loadResource = function(resource, resourceName, parameters)
        {
            var deferred = $q.defer();

            var resolveResourceParameters = function(resource, parameters)
            {
                // Resolve parameters for the resource.
                var refs = getAllResourceRefs(resource);
                angular.forEach(refs, function(ref, refName) {
                    ref.Value = resolveStackRef(refName, parameters);
                });

            };

            resolveResourceParameters(resource, parameters);

            if (resource.Type === AWS_CloudFormation_Stack) {
                // Load from template URL is asynchronous & recursive.
                var templateUrl = resolveResourceProperty(resource, 'TemplateURL', stack);
                loadStackTemplateFromUrl( templateUrl ).then(function(result) {
                    resource.StackTemplate = result;
                    if (result) {
                        // Template loaded, now pass params and load the sub-stack as a resource.
                        loadStackFromTemplate(resource.StackTemplate, resource.Properties.Parameters).then(function(result) {
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
                    resourceRefs = Object.keys(getAllResourceRefs(resource));

                    if (0 === resourceRefs.length) {
                        // No dependencies, load now (or at least get a promise to that affect).
                        resourcePromises[resourceName] = loadResource(resource, resourceName, stack.Parameters);
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
                            resourcePromises[resourceName] = loadResource(resource, resourceName, stack.Parameters);
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
                                    loadResource(resource, resourceName, stack.Parameters).then(function(result)
                                    {
                                        // Replace the Refs within result Refs.
                                        var resolveResourceRefs = function(resource, resourceRefs)
                                        {
                                            // Resolve resource refs for the resource.
                                            var refs = getAllResourceRefs(resource);
                                            angular.forEach(refs, function(ref, refName) {
                                                ref.Value = resolveStackRef(refName, null, resourceRefs);
                                            });
                                        };

                                        resolveResourceRefs(resource, results);

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
            if (property.Value) {
                return property.Value;
            }
            else if (typeof property.Ref !== 'undefined') {
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

// Directives

//
// Stack Directive - Render the resources.
//
cloudviewApp.directive('cloudviewStack', function($compile) {
    return {
        restrict: 'E',
        scope: {
            stack : '=',
            parent : '=',
            name : '='
        },
        template : 
            '<div class="stack" title="{{name}}">' +
                '<cloudview-stack-resource ' + 
                    'ng-repeat-start="(resourceName, resource) in stack.Resources" ' + 
                    'ng-repeat-end resource="resource" stack="stack" name="resourceName" />' + 
            '</div>',
        replace : true
    }
});

//
// Stack Resource - Render a single resource.
//
cloudviewApp.directive('cloudviewStackResource', function($compile) {
    return {
        restrict : 'E',
        scope : {
            resource : '=',
            stack : '=',
            name : '=',
        },
        link : function (scope, element, attrs) {
            var elementMap = {
                'AWS::CloudFormation::Stack' : '<cloudview-stack stack="resource.Stack" parent="stack" name="name" />',
//                'AWS::EC2::VPC' : '<cloudview-vpc properties="resource.Properties" stack="stack" name="name"/>'
            };

            scope.$watch('resource', function(newValue, oldValue)
            {
                if (!newValue) {
                    return;
                }

                var stack = scope.stack;
                var resource = scope.resource;

                // Map resources to HTML elements.
                var eleType, resourceHtml;
                if ('undefined' === typeof elementMap[resource.Type]) {
                    // Ignore elements that aren't mapped.
                    var newElement = angular.element('<div class="resource ' + scope.resource.Type + 
                        '" title="' + scope.name + '">' + scope.name + '</div>');
                    element.replaceWith(newElement);
                    return;
                }

                var template = elementMap[resource.Type];
                var newElement = angular.element(template);
                console.log('inserting ' + scope.name);
                $compile(newElement)(scope);
                element.replaceWith(newElement);
            },
            true);
        }
    }
});

cloudviewApp.directive('cloudviewVpc', function() {
    return {
        restrict: 'E',
        scope: {
            properties : '=',
            stack : '=',
            name : '=',
        },
        template : '<div class="vpc">{{properties.CidrBlock.Value}}</div>',
        replace : true
    }
});
