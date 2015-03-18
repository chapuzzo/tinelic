define(['tinybone/base', 'lodash',"tinybone/backadapter","safe",'highcharts', 'dustc!templates/err_graph.dust'],function (tb,_,api, safe) {
    var view = tb.View;
    var View = view.extend({
        id:"templates/err_graph",
        postRender:function () {
			view.prototype.postRender.call(this);
			if (this.parent.data.event.event) {
				var message=this.parent.data.event.event.message
				var quant = this.parent.data.fr.quant;
				var offset = new Date().getTimezoneOffset();
				var errflat = [], errprev = null;
				_.each(this.data, function (a) {
					if (errprev) {
						for (var i=errprev._id+1; i< a._id; i++) {
							errflat.push({_id: i, value:null});
						}
					}
					errprev = a;
					errflat.push(a);
				})
				var rpmerr = [];
				_.each(errflat, function (a) {
					var d = new Date(a._id*quant*60000);
					d.setMinutes(d.getMinutes()-offset);
					d = d.valueOf();
					var errrpm1 = a.value? a.value.r:0;
					rpmerr.push([d,errrpm1]);
				})
				this.$('#rpm-err').highcharts({
					chart:{
						type: 'spline',
						zoomType: 'x'
					},
					title: {
						text: ''
					},
					xAxis: {
						type:'datetime',
						title: {
							text: 'Date'
						}
					},
					yAxis: [{
						title: {
							text: 'rpm'
						},
						min:0
					}
					],
					plotOptions: {
						series: {
							marker: {
								enabled: false
							},
							animation: false
						}
					},
					series: [{
						name: message,
						data:rpmerr,
						color:"green",
						type: 'area',
						fillColor: {
							linearGradient: {
											  x1: 0,
                                              y1: 0,
                                              x2: 0,
                                              y2: 1
                            },
                            stops: [
                                              [0, 'lightgreen'],
                                              [1, 'white']
                            ]
                        }
					}
					]
				})
		}
		}
    })
    View.id = "views/err_graph_view";
    return View;
})