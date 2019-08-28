angular
    .module('myApp', ['angularMoment', 'ngResource', 'ui.bootstrap', 'ui.grid', 'ui.grid.exporter', 'ui.grid.resizeColumns', 'ui.grid.selection'])
    .controller('metricsController', ['$scope', '$q', 'uiGridConstants', 'searchService', 'github.api', 'sharedData', function ($scope, $q, uiGridConstants, searchService, api, sharedData) {
        var ctrl = this;
        const perPageLimit = 100;

        function resetData() {
            ctrl.items = [];
            ctrl.comments = [];
            ctrl.userStats = {};
            ctrl.userStatsList = [];
            ctrl.isLoading = 0;
        }
        resetData();

        ctrl.loadSampleFilter = function () {
            ctrl.token = sharedData.token;
            ctrl.filter.organization = sharedData.organization;
            ctrl.repositoriesJSON = angular.toJson(sharedData.repos, true);
        };

        ctrl.getMetrics = function () {
            resetData();
            ctrl.total_count = 0;
            sharedData.token = ctrl.token;

            var repos = angular.fromJson(ctrl.repositoriesJSON);
            _.each(repos, function (re) {
                var filter = angular.copy(ctrl.filter);
                filter.repo = re;
                filter.page = 1;
                processMetricsPage(filter);
            });
        };

        function processMetricsPage(filter) {
            wrapLoading(function () {
                return searchService.prSearch(filter).then(function (response) {
                    var data = response.data;
                    if (filter.page === 1) {
                        ctrl.total_count += data.total_count;

                        var numberOfPages = Math.ceil(data.total_count / perPageLimit);
                        for (filter.page = 2; filter.page <= numberOfPages; filter.page++) {
                            processMetricsPage(filter);
                        }
                    }

                    _.each(data.items, function (pr) {
                        pr.repo = filter.repo;
                        pr.created_at = new Date(pr.created_at);
                        pr.closed_at = new Date(pr.closed_at);
                        pr.totalTime = pr.closed_at - pr.created_at;
                        var detailsFilter = { organization: filter.organization, repo: filter.repo, pull_number: pr.number };

                        wrapLoading(function () {
                            return api.getPr(detailsFilter, function (data) {
                                pr.changed_files = data.changed_files;
                                pr.changed_lines = data.additions + data.deletions;
                                addStatistics(data.merged_by.login, 'merged');
                            }).$promise;
                        });

                        wrapLoading(function () {
                            return api.getPrReviews(detailsFilter, function (data) {
                                pr.requestedChangesCount = _.where(data, { state: "CHANGES_REQUESTED" }).length;
                                pr.otherReviews = data.length - pr.requestedChangesCount;

                                var filteredData = _.filter(data, function (x) { return x.user.login !== pr.user.login; });
                                var groupedLogins = _.countBy(filteredData, function (x) { return x.user.login; });
                                _.each(groupedLogins, function (count, key) {
                                    addStatistics(key, 'unique_PR_Reviews');
                                    addStatistics(key, 'reviews', count);
                                });
                            }).$promise;
                        });

                        if (pr.comments > 0) {
                            wrapLoading(function () {
                                return api.getBasicComments(detailsFilter, function (data) {
                                    _.each(data, function (x) {
                                        x.repo = pr.repo;
                                        x.number = pr.number;
                                        ctrl.comments.push(x);
                                        addStatistics(x.user.login, 'comments');
                                    });
                                }).$promise;
                            });
                        }

                        wrapLoading(function () {
                            return api.getPrComments(detailsFilter, function (data) {
                                _.each(data, function (x) {
                                    x.repo = pr.repo;
                                    x.number = pr.number;
                                    ctrl.comments.push(x);
                                    addStatistics(x.user.login, 'comments');
                                    pr.comments++;
                                });
                            }).$promise;
                        });
                    });

                    ctrl.items.push(...data.items);
                });
            });
        }

        function addStatistics(login, property, count) {
            if (!ctrl.userStats[login]) {
                ctrl.userStats[login] = { user: login, reviews: 0, unique_PR_Reviews: 0, comments: 0, merged: 0 };
                ctrl.userStatsList.push(ctrl.userStats[login]);
            }
            ctrl.userStats[login][property] += count || 1;
        }

        function wrapLoading(func) {
            ctrl.isLoading++;
            setTimeout(function () {
                func().then(function (result) {
                    ctrl.isLoading--;
                    return result;
                }, function () {
                    //console.log('Error: ' + angular.toJson(httpResponse, true));
                    var handlerId = setInterval(function () {
                        func().then(function (result) {
                            ctrl.isLoading--;
                            clearInterval(handlerId);
                            return result;
                        });
                    }, 60000 + 10 * ctrl.isLoading);
                });
            }, 10 * ctrl.isLoading);
        }

        $scope.gridOptionsPRs = {
            columnDefs: [
                { name: 'repo', sort: { direction: uiGridConstants.DESC, priority: 0 } },
                {
                    name: 'number', width: 96, type: 'number', cellClass: 'text-right', sort: { direction: uiGridConstants.ASC, priority: 1 },
                    aggregationType: uiGridConstants.aggregationTypes.count, cellTemplate: '<a target=\'_blank\' ng-href="{{row.entity.html_url}}">{{row.entity.number}}</a>'
                },
                { name: 'Resolution time', field: 'totalTime', type: 'number', cellClass: 'text-right', cellFilter: 'amDurationFormat', aggregationType: uiGridConstants.aggregationTypes.avg, footerCellTemplate: '<div class="ui-grid-cell-contents">{{col.getAggregationValue() | amDurationFormat }}</div>' },
                { name: 'comments', type: 'number', cellClass: 'text-right', aggregationType: uiGridConstants.aggregationTypes.sum },
                { name: 'Rejections', field: 'requestedChangesCount', type: 'number', cellClass: 'text-right', aggregationType: uiGridConstants.aggregationTypes.sum },
                { name: 'otherReviews', type: 'number', cellClass: 'text-right', aggregationType: uiGridConstants.aggregationTypes.sum },
                { name: 'files', field: 'changed_files', width: 80, type: 'number', cellClass: 'text-right', aggregationType: uiGridConstants.aggregationTypes.sum },
                { name: 'lines', field: 'changed_lines', width: 80, type: 'number', cellClass: 'text-right', aggregationType: uiGridConstants.aggregationTypes.sum }
            ],
            data: 'ctrl.items',
            exporterMenuCsv: true,
            enableGridMenu: true,
            enableSorting: true,
            showColumnFooter: true
        };

        $scope.gridOptionsUsers = {
            columnDefs: [
                //  { user: login, reviews: 0, unique_PR_Reviews: 0, comments: 0, merged: 0 };
                { name: 'user', sort: { direction: uiGridConstants.ASC }, cellTemplate: '<a target=\'_blank\' ng-href="https://github.com/{{row.entity.user}}">{{row.entity.user}}</a>' },
                { name: 'All reviews', field: 'reviews', type: 'number', cellClass: 'text-right' },
                { name: 'unique_PR_Reviews', type: 'number', cellClass: 'text-right' },
                { name: 'comments', type: 'number', cellClass: 'text-right' },
                { name: 'merged PRs', field: 'merged', type: 'number', cellClass: 'text-right' }
            ],
            data: 'ctrl.userStatsList',
            exporterMenuCsv: true,
            enableGridMenu: true,
            enableSorting: true
        };

        $scope.gridOptionsComments = {
            columnDefs: [
                { name: 'repo', width: 100, sort: { direction: uiGridConstants.DESC, priority: 0 } },
                { name: 'PR #', field: 'number', width: 50, type: 'number', cellClass: 'text-right', sort: { direction: uiGridConstants.ASC, priority: 1 }, aggregationType: uiGridConstants.aggregationTypes.count },
                { name: 'user', field: 'user.login', width: 80, aggregationType: uiGridConstants.aggregationTypes.sum },
                { name: 'Comment', cellTooltip: true, aggregationType: uiGridConstants.aggregationTypes.sum, cellTemplate: '<a target="_blank" ng-href="{{row.entity.html_url}}" title="{{row.entity.body}}">{{row.entity.body}}</a>' }
            ],
            data: 'ctrl.comments',
            exporterMenuCsv: true,
            enableGridMenu: true,
            enableSorting: true,
            rowHeight: 90,
            onRegisterApi: function (gridApi) {
                $scope.gridApi = gridApi;
                $scope.gridApi.grid.registerRowsProcessor($scope.singleFilter, 200);
            }
        };

        $scope.gridFilter = function () {
            $scope.gridApi.grid.refresh();
        };
        $scope.singleFilter = function (renderableRows) {
            renderableRows.forEach(function (row) {
                row.visible = !ctrl.filter.excludeDimitri || row.entity.user.login !== 'dimitri-ak';
            });
            return renderableRows;
        };

        ctrl.filter = {
            startDate: new Date(),
            excludeDimitri: true
        };
        ctrl.filter.startDate.setDate(1);

        ctrl.datepickers = {
            altInputFormats: ['M!/d!/yyyy']
        };
    }])

    //.controller('myController', ['github.api', function (api) {
    //    var ctrl = this;
    //    ctrl.value = 0;

    //    ctrl.repostest = function (state) {
    //        ctrl.value += 1;
    //        console.log('incremented. new value ' + state);

    //        api.repos({ state: state },
    //            function (data) {
    //                ctrl.data = data;
    //            });
    //    };

    //    ctrl.limit = function () {
    //        console.log('ctrl.limit');

    //        api.limit({},
    //            function (data) {
    //                ctrl.data = data;
    //            });
    //    };
    //}])
    ;
