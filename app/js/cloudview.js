'use strict';

/* Controllers */

var cloudviewApp = angular.module('cloudviewApp', [
]);

cloudviewApp.controller('CloudviewCtrl', function($scope, $http)
{
    $scope.loadStack = function()
    {
        if ($scope.templateUrl) {
            $http.get($scope.templateUrl).success(function(data) {
                $scope.stack = loadStack(data);
        //        $scope.stack = CloudStack.query();
            });
        }
    };

    $scope.updateStackParams = function()
    {
        if ($scope.stack && $scope.stack.Parameters) {
        }
    };

    $scope.jsonStringify = JSON.stringify;
    $scope.isEmpty = function(obj)
    {
        return !obj || angular.equals(obj, {});
    };

    var loadStack = function(stackTemplate)
    {
        var stack = {};
        // Load params.
        stack.Parameters = {};
        if (stackTemplate.Parameters) {
            angular.forEach(stackTemplate.Parameters, function(param, paramName)
            {
                if (param.Default && !param.Value) {
                    // Set param default value.
                    param.Value = param.Default;
                }
                stack.Parameters[paramName] = param;
            }, stack);
        }
        return stackTemplate;
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
