
var cloudviewApp = angular.module('cloudviewApp');

// Constants
var AWS_CLOUDFORMATION_STACK = 'AWS::CloudFormation::Stack';

/**
 * Create a new service for managing the cloudview stack with AWS cloudformation.
 */
cloudviewApp.service('cloudformation', ['$http', '$q', function($http, $q) {
    /**
     * Load stack template JSON from the given URL.
     */
    var loadStackTemplateFromUrl = function(templateUrl)
    {
        var deferred = $q.defer();

        if (templateUrl) {
            $http.get(templateUrl).
                success(function(data) {
                    deferred.resolve(data);
                }).
                error(function(){
                    deferred.reject('Failed to load template from URL.');
                });
        }
        else {
            deferred.reject('Template URL must not be empty.');
        }

        return deferred.promise;
    };

    /**
     * Return a new Stack from the given template JSON.
     */
    var loadStackFromTemplate = function(stackTemplate, parameters, stack)
    {
        // Create a promise for the result.
        var deferred = $q.defer();

        if (!stack) {
            stack = { };
        }

        // Save the template to the stack.
        stack.Template = stackTemplate;

        // Load params from template & parameters passed in.
        stack.Parameters = _loadStackParameters(stackTemplate, parameters);

        // Load resources.
        var promise = _loadStackResources(stackTemplate, stack);
        promise.then(function(result) {
            // Resources loaded.
            stack.Resources = result;

            // Resolve stack outputs.
            stack.Outputs = _resolveStackOutputs(stack);

            // Stack loaded - resolve the promise.
            deferred.resolve(stack);
        },
        function(reason) {
            debugger;
        });

        return deferred.promise;
    };

    /**
     * Helper function for loading the given parameters into the given stack template.
     */
    var _loadStackParameters = function(stackTemplate, parameters)
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

    /**
     * Helper function for loading all resources for the given stack/template.
     */
    var _loadStackResources = function(stackTemplate, stack)
    {
        if (!stackTemplate.Resources) {
            return false;
        }

        //
        // Note. A resource dependency is a resource that must be loaded first, before another
        // resource can be loaded.
        //
        // Eg. A subnet resource must be loaded before an ec2 resource can be loaded.
        //

        var resources = {}; // Map of resources to return.
        var resourcePromises = {}; // Map of resourceName => promise to load.
        var resourcesToLoad = angular.copy(stackTemplate.Resources); // Copy the resources out of the template for our "toload" stack.

        // Process all resources (create a depency map of promises).
        // Loop over resources for as long as it takes to build a web of promises.
        // This is needed in case an ec2 resource shows up in the stack list before the
        // subnet resource. In that case the ec2 resource is skipped until the subnet
        // resource (and it's promise) has been setup.
        var numResourcesToLoad;
        do {
            // Get the number of resources to load. If none are loaded after each loop then throw.
            numResourcesToLoad = Object.keys(resourcesToLoad).length;

            angular.forEach(resourcesToLoad, function(resource, resourceName) {
                // Find dependencies.
                var dependencyPromises = _getResourceDependencies(
                    resource,
                    resourceName,
                    stackTemplate.Resources,
                    resourcePromises);

                // If "false", then promises haven't been loaded yet.
                if (dependencyPromises !== false) {
                    // Promises are in - load resource.
                    resourcePromises[resourceName] = loadResource(
                        stack,
                        resource,
                        resourceName,
                        stack.Parameters,
                        dependencyPromises);
                    delete resourcesToLoad[resourceName];
                }
                // else, wait until next loop until all dependency promises are in.
            });

            // If no resources were loaded in this loop, err.
            if (Object.keys(resourcesToLoad).length === numResourcesToLoad) {
                throw "Couldn't resolve resource dependencies";
            }
        } while (!_isEmpty(resourcesToLoad));

        // Combine all resource promises into a single promise for this function.
        return $q.all(resourcePromises);
    };

    /**
     * For the given resource, return all resource promises that it depends on.
     */
    var _getResourceDependencies = function(resource, resourceName, resources, resourcePromises)
    {
        // Check resource requirements (refs to resolve).
        var resourceRefs = Object.keys(getAllResourceRefs(resource));
        var resourceDependencies = [];
        var dependencyPromises = {};

        if (0 !== resourceRefs.length) {
            // Can't load until dependencies are met, so find which Refs are dependent
            // on another resource.
            angular.forEach(resourceRefs, function(ref) {
                if (typeof resources[ref] !== 'undefined') {
                    // This is a ref to another resource in the stack, so it's a dependency.
                    resourceDependencies.push(ref);
                }
            });
        }

        if (0 !== resourceDependencies.length) {
            // This resource is dependent on 1 or more other resources, check if
            // their promises are in. Build a list of all the promises.
            angular.forEach(resourceDependencies, function(dep) {
                if (typeof resourcePromises[dep] !== 'undefined') {
                    dependencyPromises[dep] = resourcePromises[dep];
                }
            });
        }

        // TODO: Check for getatt of another resource.

        // If all the promises are in, return them, else return false.
        // Note. This will return an empty object {} if there are no dependencies.
        return (Object.keys(dependencyPromises).length === resourceDependencies.length)
            ? dependencyPromises
            : false;
    }

    /**
     * Load a single resource (with all parameters/dependencies met).
     */
    var loadResource = function(stack, resource, resourceName, parameters, dependencyPromises)
    {
        var deferred = $q.defer();

        var _resolveResourceRefs = function(resource, parameters, dependencies)
        {
            // Resolve refs for the resource.
            var refs = getAllResourceRefs(resource);
            angular.forEach(refs, function(ref, refName) {
                ref.Value = resolveStackRef(stack, refName); // , parameters, dependencies);
            });
        };

        var _load = function(resource, resourceName, parameters, dependencies)
        {
            console.log(resourceName);
            _resolveResourceRefs(resource, parameters, dependencies);

            if (resource.Type === AWS_CLOUDFORMATION_STACK) {
                // Load from template URL is asynchronous & recursive.
                var templateUrl = resolveResourceProperty(stack, resource, 'TemplateURL');
                if (!templateUrl) {
                    debugger;
                    deferred.reject('Template URL for ' + resourceName + ' not set');
                }
                else {
                    loadStackTemplateFromUrl( templateUrl ).then(function(result) {
                        resource.StackTemplate = result;
                        // Template loaded, now pass params and load the sub-stack as a resource.
                        loadStackFromTemplate(resource.StackTemplate, resource.Properties.Parameters).then(function(result) {
                            // Save stack on the resource.
                            resource.Stack = result;
                            deferred.resolve(resource);
                        },
                        function(reason) {
                            debugger;
                        });
                    });
                }
            }
            else {
                deferred.resolve(resource);
            }
        }

        // Create a single promise for the dependencies, and load after.
        if (dependencyPromises && Object.keys(dependencyPromises).length) {
            $q.all(dependencyPromises).then(function(results) {
                _load.call(this, resource, resourceName, parameters, results);
            });
        }
        else {
            // No dependencies, load now.
            _load.call(this, resource, resourceName, parameters, []);
        }

        return deferred.promise;
    };

    /**
     * Load a single resource (with the promises of dependencies).
    var loadResourceWithDependencies = function(stack, resource, resourceName, parameters, dependencyPromises)
    {
        // Once all dependencies are met, load this resource.
        dependenciesPromise.then(function(results) {
            // TODO: Resolve resource parameters for Fn::GetAtt.
            // ie -> Look for resource.Properties.Parameters.VpcId
            // = Fn::GetAtt.0 = VpcStack & Fn::GetAtt.1 = Outputs.VpcId
            loadResource(stack, resource, resourceName, stack.Parameters, results).then(function(result)
            {

                // And pass my result back up to resolve my promise.
                deferred.resolve(result);
            });
        });

        return deferred;
    };
    */

    /**
     * Helper function for resolving the stack output values.
     */
    var _resolveStackOutputs = function(stack)
    {
        var outputs = {};
        if ('undefined' !== stack.Template.Outputs) {
            angular.forEach(stack.Template.Outputs, function(output, outputName) {
                outputs[outputName] = resolveStackValue(stack, output.Value);
            });
        }

        return outputs;
    };

    /**
     * For the given resource, return a map of all the refs the object requires.
     */
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
                    else if ('undefined' !== typeof value['Fn::GetAtt']) {
                        refs[value['Fn::GetAtt'][0]] = value['Fn::GetAtt'];
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

    /**
     * Return bool if the given resource has all refs met by the parameters / resources.
    var isResourceRefsMet = function(resource, parameters, resources)
    {
        var refs = Object.keys(getAllResourceRefs(resource));

        var allMet = true;
        var isMet;

        angular.forEach(refs, function(ref) {
            isMet = resolveStackRef(stack, ref); // , parameters, resources);
            allMet = allMet && isMet;
        });

        return allMet;
    };
    */

    /**
     * For the given resource/property, resolve the value from the parameters & dependencies.
     */
    var resolveResourceProperty = function(stack, resource, propertyName)
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
                return resolveStackRef(stack, property.Ref); // , stack.Parameters, stack.Resources);
            }
            else {
                // TODO: Check for functions.
                return property;
            }
        }
    };

    /**
     * Resolve the given value for the stack.
     *
     * Ie. Fn::, Ref:, etc.
     */
    var resolveStackValue = function(stack, value)
    {
        var fnName;

        if (!angular.isObject(value)) {
            return value;
        }
        else if ('undefined' !== typeof value.Ref) {
            return resolveStackRef(stack, value.Ref);
        }
        else if (_isFnValue(value)) {
            var fnName = _getFnName(value);
            return resolveStackFn(stack, fnName, value['Fn::' + fnName]);
        }
        else {
            return value;
        }
    };

    /**
     * Resolve the given "Ref:" property from the parameters/resources.
     */
    var resolveStackRef = function(stack, ref)
    {
        // Check Parameters.
        if (stack.Parameters && stack.Parameters[ref]) {
            return stack.Parameters[ref].Value;
        }
        // Check Resources.
        else if (stack.Resources && stack.Resources[ref]) {
            return stack.Resources[ref];
        }
        else {
            return null;
        }
    };

    var _isFnValue = function(value)
    {
        var keys = Object.keys(value);
        return (keys.length === 1 && (keys[0].indexOf('Fn::')===0));
    };

    var _getFnName = function(value)
    {
        return Object.keys(value)[0].substring(4); // 4 == 'Fn::'.length
    };

    var resolveStackFn = function(stack, fnName, args)
    {
        if (fnName === 'GetAtt') {
            return resolveFnGetAtt(stack, args);
        }
        else if (fnName === 'Join') {
            return resolveFnJoin(stack, args);
        }
        else {
            throw "No function: " + fnName;
        }

    };

    var resolveFnGetAtt = function(stack, args)
    {
        if (args[1] === 'Arn') {
            // Arn is just the ref to the resource itself.
            return stack.Resources[args[0]];
        }
        else if (args[1].indexOf('Outputs.') === 0) {
            // GetAtt is for a substack's outputs.
            var outputName = args[1].substring(8); // 8 = 'Outputs.'.length
            return stack.Resources[args[0]].Stack.Outputs[outputName];
        }
        else {
            // Impossible to resolve attributes.
            return 'Attr::' + args[0] + '::' + args[1];
        }

    };

    var resolveFnJoin = function(stack, args)
    {
        var i,
            separator = args[0],
            joinParts = [];

        for (i=0; i<args[1].length; i++) {
            joinParts.push(resolveStackValue(stack, args[1][i]));
        }

        return joinParts.join(separator);
    };

    /**
     * Check if value is empty, including objects that are {}.
     */
    var _isEmpty = function(obj)
    {
        return !obj || angular.equals(obj, {});
    };

    //
    // Expose a couple of methods to the service.
    //
    this.loadStackTemplateFromUrl = loadStackTemplateFromUrl;
    this.loadStackFromTemplate    = loadStackFromTemplate;
}]);
