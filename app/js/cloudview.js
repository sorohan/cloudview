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

// Constants
var AWS_CLOUDFORMATION_STACK = 'AWS::CloudFormation::Stack';
var AWS_EC2_VPC = 'AWS::EC2::VPC';
var AWS_EC2_Subnet = 'AWS::EC2::Subnet';
var AWS_EC2_Instance = 'AWS::EC2::Instance';

// Define cloud topology.
var STACK_ROOT = '__stack_root__'; // cloud topology root.
var CLOUD_TOPOLOGY = {
    'AWS::EC2::VPC' : { placement : STACK_ROOT },
    'AWS::EC2::Subnet' : { placement : 'VPCId' },
    'AWS::EC2::Instance' : { placement : 'SubnetId' }
};

/**
 * From the given stack object, resolve dependencies into a nested hierarchy.
 *
 * Eg. Take EC2 instances that reference a VPC, and add them to the VPC's "resources".
 */
var generateNetworkTopologyHierarchy = function(stack, topology)
{
    var addResourceToParent = function(resource, resourceName, parentResource)
    {
        if (!parentResource) {
            return;
        }

        if (!parentResource.Resources) {
            parentResource.Resources = {};
        }
        parentResource.Resources[resourceName] = resource;
    };

    if (typeof topology == 'undefined') {
        topology = { };
    }
    angular.forEach(stack.Resources, function(resource, resourceName) {
        return;
        var placement, isParentDefined;
        if (resource.Type === AWS_CLOUDFORMATION_STACK) {
            // Recurse, add this stack to the topology.
            topology = generateNetworkTopologyHierarchy(resource.Stack, topology);
        }
        else {
            // Check for resource within the topology map.
            if (typeof CLOUD_TOPOLOGY[resource.Type] !== 'undefined') {
                placement = CLOUD_TOPOLOGY[resource.Type] ;
                if (placement === STACK_ROOT) {
                    // Resource belongs in the top-level.
                    topology[resourceName] = resource;
                }
                else {
                    // Resource belongsTo another member of the stack, which should be
                    // defined as one of it's properties.
                    isParentDefined = (resource.Properties &&
                        resource.Properties[placement] &&
                        resource.Properties[placement] &&
                        resource.Properties[placement].prototype);
                    if (isParentDefined) {
                        addResourceToParent(resource, resourceName, resource.Properties[placement]);
                    }
                    else {
                        console.log(resourceName + ' is orphaned');
                    }
                }

            }
        }
    });

    return topology;
};

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
