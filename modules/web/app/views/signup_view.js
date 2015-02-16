define(['tinybone/base', "tinybone/backadapter", 'dustc!templates/signup.dust'],function (tb, api) {
    var view = tb.View;
    var View = view.extend({
        id:"templates/signup",
        events: {
            "click .btn":function(e) {
                var self = this;
                var login = self.$('#login')[0].value;
                var pass = self.$('#pass')[0].value;
                var dang = self.$('.panel-danger');
                var textErr = self.$('.panel-body');
                api("users.signUp", "public", {login: login, pass: pass},  function(err, t) {
                    if (err) {
                        dang.css({display: 'block'});
                        textErr.html('Login or password incorrect');
                    }
                    else {
                       $.cookie("token", t, { expires: 7 })
                       self.app.router.navigateTo('/web/')
                    }
                });
            }
        }
    })
    View.id = "views/signup_view";
    return View;
})