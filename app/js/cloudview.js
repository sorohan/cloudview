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

    $scope.jsonStringify = JSON.stringify;
    $scope.isEmpty = function(obj)
    {
        return !obj || angular.equals(obj, {});
    };

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
            angular.forEach(stackTemplate.Parameters, function(param, paramName)
            {
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
        var deferred = $q.defer();

        var resources = {};
        var delayed = {};
        var attempts = 0;
        var maxAttempts = 100;

        var isResouceRefsMet = function(resource, stack)
        {
            return true;
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
                        })
                    }
                    else {
                        // Template failed to load.
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
            // Process resources until all done, or give up.
            var resourcesToLoad = angular.copy(stackTemplate.Resources);
            while (!$scope.isEmpty(resourcesToLoad) && attempts < maxAttempts)
            {
                angular.forEach(resourcesToLoad, function(resource, resourceName)
                {
                    if (isResouceRefsMet(resource, stack)) {
                        // Resources met, load then check if we can resolve our promise to load all.
                        loadResource(resource, resourceName).then(function(result) {
                            resources[resourceName] = result;
                            if (Object.keys(resources).length === Object.keys(stackTemplate.Resources).length) {
                                // That's all promises met (resources all loaded).
                                deferred.resolve(resources);
                            }
                        });

                        // Delete from resource queue (even if it's still loading asynchonously,
                        // remove it from the list of resources that still need loading.
                        delete resourcesToLoad[resourceName];
                    }
                    // else, resource stays in resourceToLoad until refs are met.
                });
                attempts++;
            }
        }

        if (!$scope.isEmpty(delayed)) {
            throw "Resource refs not met."
        }

        return deferred.promise;
    };

    var resolveResourceProperty = function(resource, propertyName, stack)
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
                return resolveStackRef(property.Ref, stack);
            }
            else {
                return property;
            }
        }
    };

    var resolveStackRef = function(ref, stack)
    {
        // Check Parameters.
        if (stack.Parameters && stack.Parameters[ref]) {
            return stack.Parameters[ref].Value;
        }
        else {
            return null;
        }
    };
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
