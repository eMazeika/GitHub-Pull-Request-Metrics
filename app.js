angular
    .module('myApp', ['angularMoment', 'ngResource', 'ui.bootstrap', 'ui.grid', 'ui.grid.exporter', 'ui.grid.resizeColumns', 'ui.grid.selection'])
    .controller('metricsController', ['$scope', '$q', 'uiGridConstants', 'searchService', 'github.api', 'sharedData', function ($scope, $q, uiGridConstants, searchService, api, sharedData) {
        var ctrl = this;

        function resetData() {
            ctrl.items = [];
            ctrl.comments = [];
            ctrl.userStats = {};
            ctrl.userStatsList = [];
        }
        resetData();

        ctrl.loadSampleFilter = function () {
            ctrl.token = sharedData.token;
            ctrl.filter.organization = sharedData.organization;
            ctrl.repositoriesJSON = angular.toJson(sharedData.repos, true);
        };

        ctrl.getMetrics = function () {
            ctrl.isLoading = true;
            resetData();

            sharedData.token = ctrl.token;
            var filter = angular.copy(ctrl.filter);
            filter.repos = angular.fromJson(ctrl.repositoriesJSON);


            var promisesForPRs = [];
            var total_count = 0;

            _.each(filter.repos, function (re) {
                filter.repo = re;
                promisesForPRs.push(
                    searchService.prSearch(filter).then(function (response) {
                        var data = response.data;
                        total_count += data.total_count;
                        var detailsFilter = { organization: filter.organization, repo: re };
                        _.each(data.items, function (pr) {
                            pr.repo = re;
                            pr.created_at = new Date(pr.created_at);
                            pr.closed_at = new Date(pr.closed_at);
                            pr.totalTime = pr.closed_at - pr.created_at;
                            detailsFilter.pull_number = pr.number;

                            api.getPr(detailsFilter, function (data) {
                                pr.changed_files = data.changed_files;
                                pr.changed_lines = data.additions + data.deletions;
                                addStatistics(data.merged_by.login, 'merged');
                            });

                            api.getPrReviews(detailsFilter, function (data) {
                                pr.requestedChangesCount = _.where(data, { state: "CHANGES_REQUESTED" }).length;
                                pr.otherReviews = data.length - pr.requestedChangesCount;

                                var filteredData = _.filter(data, function (x) { return x.user.login !== pr.user.login; });
                                var groupedLogins = _.countBy(filteredData, function (x) { return x.user.login; });
                                _.each(groupedLogins, function (count, key) {
                                    //console.log('login: ' + key);
                                    addStatistics(key, 'unique_PR_Reviews');
                                    addStatistics(key, 'reviews', count);
                                });
                            });

                            if (pr.comments > 0) {
                                api.getBasicComments(detailsFilter, function (data) {
                                    _.each(data, function (x) {
                                        x.repo = pr.repo;
                                        x.number = pr.number;
                                        ctrl.comments.push(x);
                                        addStatistics(x.user.login, 'comments');
                                    });
                                });
                            }

                            api.getPrComments(detailsFilter, function (data) {
                                _.each(data, function (x) {
                                    x.repo = pr.repo;
                                    x.number = pr.number;
                                    ctrl.comments.push(x);
                                    addStatistics(x.user.login, 'comments');
                                    pr.comments++;
                                });
                            });
                        });

                        return data.items;
                    })
                );
            });

            $q.all(promisesForPRs).then(function (allResults) {
                ctrl.items = _.flatten(allResults, true);

                if (total_count !== ctrl.items.length) alert("total_count - items.length: " + total_count - ctrl.items.length);
                ctrl.isLoading = false;
            });
        };

        function addStatistics(login, property, count) {
            if (!ctrl.userStats[login]) {
                ctrl.userStats[login] = { user: login, reviews: 0, unique_PR_Reviews: 0, comments: 0, merged: 0 };
                ctrl.userStatsList.push(ctrl.userStats[login]);
            }
            ctrl.userStats[login][property] += count || 1;
        }

        $scope.gridOptionsPRs = {
            columnDefs: [
                { name: 'repo', sort: { direction: uiGridConstants.DESC, priority: 0 } },
                {
                    name: 'number', width: 96, sort: { direction: uiGridConstants.ASC, priority: 1 },
                    aggregationType: uiGridConstants.aggregationTypes.count, cellTemplate: '<a target=\'_blank\' ng-href="{{row.entity.html_url}}">{{row.entity.number}}</a>'
                },
                { name: 'Resolution time', field: 'totalTime', cellFilter: 'amDurationFormat', aggregationType: uiGridConstants.aggregationTypes.avg, footerCellTemplate: '<div class="ui-grid-cell-contents">{{col.getAggregationValue() | amDurationFormat }}</div>' },
                { name: 'comments', aggregationType: uiGridConstants.aggregationTypes.sum },
                { name: 'Rejections', field: 'requestedChangesCount', aggregationType: uiGridConstants.aggregationTypes.sum },
                { name: 'otherReviews', aggregationType: uiGridConstants.aggregationTypes.sum },
                { name: 'files', field: 'changed_files', width: 80, aggregationType: uiGridConstants.aggregationTypes.sum },
                { name: 'lines', field: 'changed_lines', width: 80, aggregationType: uiGridConstants.aggregationTypes.sum }
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
                { name: 'user', sort: { direction: uiGridConstants.ASC } },
                { name: 'All reviews', field: 'reviews' },
                { name: 'unique_PR_Reviews' },
                { name: 'comments' },
                { name: 'merged PRs', field: 'merged' }
            ],
            data: 'ctrl.userStatsList',
            exporterMenuCsv: true,
            enableGridMenu: true,
            enableSorting: true
        };

        $scope.gridOptionsComments = {
            columnDefs: [
                { name: 'repo', width: 100, sort: { direction: uiGridConstants.DESC, priority: 0 } },
                { name: 'PR #', field: 'number', width: 50, sort: { direction: uiGridConstants.ASC, priority: 1 }, aggregationType: uiGridConstants.aggregationTypes.count },
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
