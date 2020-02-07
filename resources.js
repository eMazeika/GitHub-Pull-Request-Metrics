angular
    .module('myApp')
    .constant('baseUrl', 'https://api.github.com/')
    .factory('sharedData', function () {
        return {
            token: '',
            organization: '',
            repos: [				
            ]
        };
    })

    .factory('github.api', ['$resource', 'baseUrl', function ($resource, bu) {
        return $resource(null, null, {
            getPr: { url: bu + 'repos/:organization/:repo/pulls/:pull_number' },
            getPrReviews: { url: bu + 'repos/:organization/:repo/pulls/:pull_number/reviews', isArray: true },
            getPrComments: { url: bu + 'repos/:organization/:repo/pulls/:pull_number/comments', isArray: true },
			getBasicComments: { url: bu + 'repos/:organization/:repo/issues/:pull_number/comments', isArray: true },
			getCommits: { url: bu + 'repos/:organization/:repo/commits', isArray: true },

            // methods for API testing
            limit: { url: bu + 'rate_limit' },
            repos: { url: bu + 'repos/:organization/hot-theme/issues', isArray: true }
        });
    }])

    .service('searchService', ['$http', 'baseUrl', function ($http, bu) {
        return {
            prSearch: function (filter) {
                var beginDate = moment(filter.startDate).format().slice(0, 10);
                var endDate = filter.endDate ? moment(filter.endDate).format().slice(0, 10) : '*';

                var queryFilter = '+repo:' + filter.organization + '/' + filter.repo + '+closed:' + beginDate + '..' + endDate;
                return $http.get(bu + 'search/issues?per_page=100&page=' + filter.page + '&q=is:pr+is:merged' + queryFilter);
            }
        };
    }])

	.service('searchService', ['$http', 'baseUrl', function ($http, bu) {
        return {
            commitSearch: function (filter) {
                var beginDate = moment(filter.startDate).format().slice(0, 10);
                var endDate = filter.endDate ? moment(filter.endDate).format().slice(0, 10) : '*';

                var queryFilter = 'repos/' + filter.organization + '/' + filter.repo + '/commits';
                return $http.get(bu + queryFilter, {params: { since: beginDate }});
            }
        };
    }])
	
	.factory('httpErrorInterceptor', ['sharedData', function (sharedData) {
        var httpErrorInterceptor = {};

        httpErrorInterceptor.request = function (config) {
            config.headers.Authorization = 'token ' + sharedData.token;
            config.headers.Accept = 'application/vnd.github.v3+json';

            return config;
        };

        return httpErrorInterceptor;
    }])

    .config(['$httpProvider', function ($httpProvider) {
        $httpProvider.interceptors.push('httpErrorInterceptor');
    }])
    ;
