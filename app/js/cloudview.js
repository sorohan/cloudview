'use strict';

// Module

var cloudviewApp = angular.module('cloudviewApp', [ ]);

// Controllers

cloudviewApp.controller('CloudviewCtrl', ['$scope', 'cloudformation', function ($scope, cloudformation)
{
    var CF = cloudformation;

    /**
     * Load the stack from the URL.
     */
    $scope.loadStackFromUrl = function()
    {
        if ($scope.templateUrl) {
            CF.loadStackTemplateFromUrl($scope.templateUrl).then(function(result) {
                // When template loads, load the stack.
                $scope.mainStackTemplate = result;
                $scope.loadStackFromTemplate();
            },
            function(reason) {
                alert('Failed: ' + reason);
            });
        }
    };

    /**
     * Create a new stack from the $scope.mainStackTemplate.
     */
    $scope.loadStackFromTemplate = function()
    {
        if (!$scope.mainStackTemplate) {
            return;
        }


        // Load stack from template returns a promise.
        CF.loadStackFromTemplate($scope.mainStackTemplate, $scope.mainStack).
            then(function(result) {
                // Entire stack is loaded, pass to scope for binding.
                $scope.mainStack = result;
                $scope.mainStackName = 'full stack';
                $scope.mainStackTopology = cloudformation.generateNetworkTopology($scope.mainStack);

            });
    };

    /**
     * Reload the stack.
    $scope.reloadStack = function()
    {
        var stack         = $scope.mainStack;
        var stackTemplate = $scope.mainStackTemplate;

        // Make a promise for it.
        var deferred = $q.defer();

        if (stack && stackTemplate) {
            // Reload all resources with new params.
            loadStackResources(stackTemplate, stack).then(function(result) {
                // Resources loaded.
                stack.Resources = result;

                // Stack loaded - resolve the promise.
                deferred.resolve(stack);
            });
        }
        else {
            deferred.fail();
        }

        return deferred.promise;
    };
     */

    var isEmpty = function(obj)
    {
        return !obj || angular.equals(obj, {});
    };

    // Expose isEmpty.
    $scope.isEmpty  = isEmpty;
}]);

/**
 * Recursive helper from @see:
 * http://stackoverflow.com/questions/14430655/recursion-in-angular-directives
 */
cloudviewApp.factory('RecursionHelper', ['$compile', function($compile){
    return {
        /**
         * Manually compiles the element, fixing the recursion loop.
         * @param element
         * @param [link] A post-link function, or an object with function(s) registered via pre and post properties.
         * @returns An object containing the linking functions.
         */
        compile: function(element, link){
            // Normalize the link parameter
            if(angular.isFunction(link)){
                link = { post: link };
            }

            // Break the recursion loop by removing the contents
            var contents = element.contents().remove();
            var compiledContents;
            return {
                pre: (link && link.pre) ? link.pre : null,
                /**
                 * Compiles and re-adds the contents
                 */
                post: function(scope, element){
                    // Compile the contents
                    if(!compiledContents){
                        compiledContents = $compile(contents);
                    }
                    // Re-add the compiled contents to the element
                    compiledContents(scope, function(clone){
                        element.append(clone);
                    });

                    // Call the post-linking function, if any
                    if(link && link.post){
                        link.post.apply(null, arguments);
                    }
                }
            };
        }
    };
}]);

// Directives

//
// Recursive stack topology - render the resources in the topology (and their children).
//
cloudviewApp.directive('cloudviewStackTopology', function(RecursionHelper) {
    return {
        restrict: 'E',
        scope: {
            topology : '=topology'
        },
        template : 
            '<cloudview-resource resource=topology></cloudview-resource>' +
            '<div class="stack-topology" title="{{name}}">' +
                '<div ng-repeat="resource in topology.nodes" style="border:1px solid black; padding:5px; margin:5px;">' +
                    '{{resource.name}}' +
                    '<cloudview-stack-topology topology="resource" ng-repeat-end />' +
                '</div>' +
            '</div>',
        compile: function(element) {
            // Use the compile function from the RecursionHelper,
            // And return the linking function(s) which it returns
            return RecursionHelper.compile(element);
        }
        // replace : true
    };
});

//
// Stack Resource - Render a single resource.
//
/*
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
                'AWS::CloudFormation::Stack' : '<cloudview-stack stack="resource.Stack" name="name" />',
                'AWS::EC2::VPC' : '<cloudview-vpc properties="resource.Properties" stack="stack" name="name" />',
                'AWS::EC2::Subnet' : '<cloudview-subnet properties="resource.Properties" stack="stack" name="name" />',
                'AWS::EC2::Instance' : '<cloudview-ec2instance properties="resource.Properties" stack="stack" name="name" />'
//                'AWS::AutoScaling::AutoScalingGroup' : '<cloudview-asgroup properties="resource.Properties" stack="stack" name="name" />',
            };

            scope.$watch('resource', function(newValue, oldValue)
            {
                if (!newValue) {
                    return;
                }

                var stack = scope.stack;
                var resource = scope.resource;

                if ('undefined' === typeof elementMap[resource.Type]) {
                    // Ignore elements that aren't mapped.
                    console.log('remove ' + resource.Type);
                    element.remove();
                    return;
                }

                // Map resources to HTML elements.
                var eleType, resourceHtml;
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
*/

/*
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

cloudviewApp.directive('cloudviewSubnet', function() {
    return {
        restrict: 'E',
        scope: {
            properties : '=',
            stack : '=',
            name : '=',
        },
        template : '<div class="subnet">Subnet</div>',
        replace : true
    }
});

cloudviewApp.directive('cloudviewAsgroup', function() {
    return {
        restrict: 'E',
        scope: {
            properties : '=',
            stack : '=',
            name : '=',
        },
        template : '<div class="asgroup">Auto-Scaling Group</div>',
        replace : true
    }
});

cloudviewApp.directive('cloudviewEc2instance', function() {
    return {
        restrict: 'E',
        scope: {
            properties : '=',
            stack : '=',
            name : '=',
        },
        template : '<div class="ec2-instance">EC2 Instance</div>',
        replace : true
    }
});
*/
