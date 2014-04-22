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

// Directives

//
// Stack Directive - Render the resources.
//
cloudviewApp.directive('cloudviewStackTopology', function($compile) {
    return {
        restrict: 'E',
        scope: {
            topology : '=topology',
            name : '=name'
        },
        link : function (scope, element, attrs) {
            scope.$watch('topology', function(newValue, oldValue) {
                if (!newValue) {
                    return;
                }
                var topology = newValue;

                console.log(topology);

                var newElement = angular.element('<div>test</div>');
                element.replaceWith(newElement);
            });
        }
        /*
        template : 
            '<div class="stack" title="{{name}}">' +
                '<cloudview-stack-resource ' + 
                    'ng-repeat-start="(resourceName, resource) in stack.Resources" ' + 
                    'ng-repeat-end resource="resource" stack="stack" name="resourceName" />' + 
            '</div>',
        */
//        replace : true
    }
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
