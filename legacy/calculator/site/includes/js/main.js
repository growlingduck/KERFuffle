var Mike = function () {
    var _clearTimeout;

    function wWidth() {
        var ww = $('body').innerWidth();
        return ww;
    }

    function lockUI() {
        $('body').addClass('lock-ui');
    }

    function unlockUI() {
        $('body').removeClass('lock-ui');
    }

    //var variablesGood = false,
    //    inputsGood = false;
    //INPUTS
    var $width = $('#i1'),
        $height = $('#i2'),
         $depth = $('#i3'),
         $shelfN = $('#i4'),
         $cabId = $('#i5'),
       $finEnds = $('#i6'); //b,n,l,r

    //Variables 
    var $pTh = $('#v1'),
          $toeHt = $('#v2'),
          $topTh = $('#v3'),
          $shelfTh = $('#v4');

    function ShelfTh(WD) {
        var val;
        //based on width
        if (WD >= 36) {
            val = 1;
        } else {
            val = .75;
        }
        //console.log('val', val);
        return val
    }

    function LamNum(n) {
        var val;
        if (n == 'N') {
            val = 0;
        } else if (n == 'L' || n == 'R') {
            val = 1;
        } else if (n == 'B') {
            val = 2;
        }
        return val;
    }

    //shelfTh = function () {
    //    //based on width
    //    if (width => 36) {
    //        return 1;
    //    } else {
    //        return .75;
    //    }
    //};

    //Base    
    ///BACK 
    ////Width = width, 
    ////Length = height - topThickness - toeKickHt

    ///Bottom
    ////Width = width - (pTh * 2)
    ////Length = depth - pTh

    ///Left & Right
    ////Width = depth - pTh
    ////Length = height - topTh - toeHt

    ///Top
    ////Width = depth - pTh
    ////Length = width - (pTh * 2)

    ///Front
    ////Width = width
    ////Length = height - topTh - toeHt

    function buildBase() {
        //console.log('build and show BASE section');
        //Show the Base Section
        $('#base-out').parent().show(250).addClass('active-cab');
        $('#wall-out').parent().hide(250).removeClass('active-cab');

        //inputs
        var w = parseFloat($width.val(), 10),
            h = parseFloat($height.val(), 10),
            d = parseFloat($depth.val(), 10),
            s = parseFloat($shelfN.val(), 10),
            c = $cabId.val(),
            e = $finEnds.val();  //b,n,l,r
        //variables
        var p = parseFloat($pTh.val(), 10),
            t = parseFloat($toeHt.val(), 10),
            T = parseFloat($topTh.val(), 10),
            S = ShelfTh(w);

        //console.log(typeof w, typeof h, typeof d, typeof s, typeof c, typeof e, typeof p, typeof t, typeof T, typeof S)
        var check = [w, h, d, s, p, t, T];

        var doubleCheck = true;
        $.each(check, function (x, z) {
            if (!(typeof z === 'number' && !isNaN(z))) {
                doubleCheck = false;
                return false;
            };
        });

        if (!doubleCheck) { return };

        //set values in table
        //Back formulas
        var baW = w,
            baL = h - t - T,
            baT = p,
            baN = 1;

        var backArr = [baW, baL, baT, baN];

        //Bottom formulas
        var btW = w - (p * 2),
            btL = d - p,
            btT = p,
            btN = 1;

        var bottomArr = [btW, btL, btT, btN];

        //Sides Formulas
        var lrW = d - p,
            lrL = h - t - T,
            lrT = p,
            lrN = 1; //same formula but separate columns so this is only 1

        var sideArr = [lrW, lrL, lrT, lrN];

        //Top formulas
        var tpW = d - p,
            tpL = w - (p * 2),
            tpT = p,
            tpN = 1;

        var topArr = [tpW, tpL, tpT, tpN];

        //Front formulas
        var ftW = w,
            ftL = h - t - T,
            ftT = p,
            ftN = 1;

        var frontArr = [ftW, ftL, ftT, ftN];

        //shelf formula
        var shW = d - p,
            shL = w - (p * 2) - 0.125,
            shT = S,
            shN = s;

        var shelfArr = [shW, shL, shT, shN];

        //laminate formulas
        var lsW = d + 1,
            lsH = h - t - T + 1,
            lsT,
            lsN = 1;
        var lamSideArr = [lsW, lsH, lsT, lsN];
        //console.log('tester: ', typeof (d));

        var lfW = w + 1,
            lfL = h - t - T + 1,
            lfT,
            lfN = 1;

        var lamFrontArr = [lfW, lfL, lfT, lfN];

        //put the numbers somewhere
        //select slots
        var $back = $('#bback'),
            $bottom = $('#bbottom'),
            $left = $('#bleft'),
            $right = $('#bright'),
            $top = $('#btop'),
            $front = $('#bfront'),
            $shelf = $('#bshelf'),
            $lamLt = $('#blaml'),
            $lamRt = $('#blamr'),
            $lamFt = $('#blamf');

        $back.find('td').each(function (h, v) {
            //console.log('h: ', h);
            $(v).text(backArr[h]);
        });
        $bottom.find('td').each(function (h, v) {
            $(v).text(bottomArr[h]);
        });
        $left.find('td').each(function (h, v) {
            $(v).text(sideArr[h]);
        });
        $right.find('td').each(function (h, v) {
            $(v).text(sideArr[h]);
        });
        $top.find('td').each(function (h, v) {
            $(v).text(topArr[h]);
        });
        $front.find('td').each(function (h, v) {
            $(v).text(frontArr[h]);
        });
        $shelf.find('td').each(function (h, v) {
            $(v).text(shelfArr[h]);
        });

        $lamLt.find('td').each(function (h, v) {
            if (e == 'L' || e == 'B') {
                //console.log('l or b');
                $(v).text(lamSideArr[h]);
            } else {
                $(v).text('');
            }
        });

        $lamRt.find('td').each(function (h, v) {
            if (e == 'R' || e == 'B') {
                //console.log('r or b');
                $(v).text(lamSideArr[h]);
            } else {
                $(v).text('');
            }
        });

        $lamFt.find('td').each(function (h, v) {
            $(v).text(lamFrontArr[h]);
        });

        $('#output').find('.cabinet-name').text(c)

    }

    //WALL    
    function buildWall() {
        //console.log('build and show WALL section');
        //Show the Wall Section
        $('#wall-out').parent().show(250).addClass('active-cab');
        $('#base-out').parent().hide(250).removeClass('active-cab');

        //inputs
        var w = parseFloat($width.val(), 10),
            h = parseFloat($height.val(), 10),
            d = parseFloat($depth.val(), 10),
            s = parseFloat($shelfN.val(), 10),
            c = $cabId.val(),
            e = $finEnds.val();  //b,n,l,r
        //variables
        var p = parseFloat($pTh.val(), 10),
            t = parseFloat($toeHt.val(), 10),
            T = parseFloat($topTh.val(), 10),
            S = ShelfTh(w);

        //console.log(typeof w, typeof h, typeof d, typeof s, typeof c, typeof e, typeof p, typeof t, typeof T, typeof S)
        var check = [w, h, d, s, p, t, T];

        var doubleCheck = true;
        $.each(check, function (x, z) {
            if (!(typeof z === 'number' && !isNaN(z))) {
                doubleCheck = false;
                return false;
            };
        });

        if (!doubleCheck) { return };

        //set values in table
        //Back formulas
        var baW = w,
            baL = h,
            baT = p,
            baN = 1;

        var backArr = [baW, baL, baT, baN];

        //Bottom formulas
        var btW = w - (p * 2),
            btL = d - p,
            btT = p,
            btN = 1;

        var bottomArr = [btW, btL, btT, btN];

        //Sides Formulas
        var lrW = d - p,
            lrL = h,
            lrT = p,
            lrN = 1; //same formula but separate columns so this is only 1

        var sideArr = [lrW, lrL, lrT, lrN];

        //Top formulas
        var tpW = d - p,
            tpL = w - (p * 2),
            tpT = p,
            tpN = 1;

        var topArr = [tpW, tpL, tpT, tpN];

        //Front formulas
        var ftW = w,
            ftL = h,
            ftT = p,
            ftN = 1;

        var frontArr = [ftW, ftL, ftT, ftN];

        //shelf formula
        var shW = d - p,
            shL = w - (p * 2) - 0.125,
            shT = S,
            shN = s;

        var shelfArr = [shW, shL, shT, shN];

        //laminate formulas
        var lsW = d + 1,
            lsH = h - t - T + 1,
            lsT,
            lsN = 1;
        var lamSideArr = [lsW, lsH, lsT, lsN];

        var lfW = w + 1,
            lfL = h - t - T + 1,
            lfT,
            lfN = 1;

        var lamFrontArr = [lfW, lfL, lfT, lfN];

        //put the numbers somewhere
        //select slots
        var $back = $('#wback'),
            $bottom = $('#wbottom'),
            $left = $('#wleft'),
            $right = $('#wright'),
            $top = $('#wtop'),
            $front = $('#wfront'),
            $shelf = $('#wshelf'),
            $lamLt = $('#wlaml'),
            $lamRt = $('#wlamr'),
            $lamFt = $('#wlamf');

        $back.find('td').each(function (h, v) {
            //console.log('h: ', h);
            $(v).text(backArr[h]);
        });
        $bottom.find('td').each(function (h, v) {
            $(v).text(bottomArr[h]);
        });
        $left.find('td').each(function (h, v) {
            $(v).text(sideArr[h]);
        });
        $right.find('td').each(function (h, v) {
            $(v).text(sideArr[h]);
        });
        $top.find('td').each(function (h, v) {
            $(v).text(topArr[h]);
        });
        $front.find('td').each(function (h, v) {
            $(v).text(frontArr[h]);
        });
        $shelf.find('td').each(function (h, v) {
            $(v).text(shelfArr[h]);
        });

        $lamLt.find('td').each(function (h, v) {
            if (e == 'L' || e == 'B') {
                //console.log('l or b');
                $(v).text(lamSideArr[h]);
            } else {
                $(v).text('');
            }
        });

        $lamRt.find('td').each(function (h, v) {
            if (e == 'R' || e == 'B') {
                //console.log('r or b');
                $(v).text(lamSideArr[h]);
            } else {
                $(v).text('');
            }
        });

        $lamFt.find('td').each(function (h, v) {
            $(v).text(lamFrontArr[h]);
        });

        $('#output').find('.cabinet-name').text(c)

    }

    function addCab() {
        var $cab = $('#maincontent .active-cab table');
        var cabId = $('#i5').val();

        $cab.find('tr').each(function () {
            var $newRow = $(this).clone();
            $newRow.find('th').attr('id', '');
            $newRow.append($('<td />', {
                'text': cabId
            }));

            //console.log('$newRow: ', $newRow);

            if ($(this).hasClass('cab')) {
                $newRow.appendTo($('#cab-cutlist tbody'));

            } else if ($(this).hasClass('lam')) {
                $newRow.find('.empty').remove();
                var $test = $newRow.find('td').eq(0);
                //console.log('test: ', $test.text().length == 0)
                if ($test.text().length == 0) {
                    return;
                }
                $newRow.appendTo($('#lam-cutlist tbody'));
            }

        });

        var $cutlist = $('#cutlist');
        $cutlist.removeClass('hidden');
        $('html,body').animate({
            scrollTop: $cutlist.offset().top - 100
        });

    }

    var $rdoBase = $('#base-rdo'),
        $rdoWall = $('#wall-rdo');

    return {

        init: function () {

            $('#maincontent').on('blur change', 'input', function () {
                var $t = $(this);
                //console.log('$this', $t);

                if ($rdoBase.hasClass('active')) {
                    buildBase();
                } else if ($rdoWall.hasClass('active')) {
                    buildWall();
                } else {
                    //console.log('error');
                };

            }).find('input').eq(0).trigger('blur');

            $('#maincontent').on('blur', 'select', function () {
                $('#maincontent').find('input').eq(0).trigger('blur');
            });

            //update disabled shelf thickness feild; based on width
            $('#maincontent').on('blur', '#i1', function () {
                var $t = $(this);
                var val;
                //console.log(parseFloat($t.val(), 10));
                if (parseFloat($t.val(), 10) >= 36) {
                    val = 1;
                } else {
                    val = .75;
                }
                $('#v4').val(val);
            });

            //disable variables that dont apply, or reable them
            $('#maincontent').on('click', '#base-rdo', function () {
                $('#v2').prop({
                    'disabled': '',
                    'required': 'required'
                });
                $('#v3').prop({
                    'disabled': '',
                    'required': 'required'
                })
            });
            $('#maincontent').on('click', '#wall-rdo', function () {
                $('#v2').prop({
                    'disabled': 'disabled',
                    'required': ''
                });
                $('#v3').prop({
                    'disabled': 'disabled',
                    'required': ''
                })
            });

            //copy values to cutlist table
            $('#maincontent').on('click', '#add-cabinet', function (e) {
                e.preventDefault();
                e.stopPropagation();

                //inputs
                var w = parseFloat($width.val(), 10),
                    h = parseFloat($height.val(), 10),
                    d = parseFloat($depth.val(), 10),
                    s = parseFloat($shelfN.val(), 10),
                    c = $cabId.val(),
                    e = $finEnds.val();  //b,n,l,r
                //variables
                var p = parseFloat($pTh.val(), 10),
                    t = parseFloat($toeHt.val(), 10),
                    T = parseFloat($topTh.val(), 10),
                    S = ShelfTh(w);

                //console.log(typeof w, typeof h, typeof d, typeof s, typeof c, typeof e, typeof p, typeof t, typeof T, typeof S)
                var check = [w, h, d, s, p, t, T];

                var doubleCheck = true;
                $.each(check, function (x, z) {
                    if (!(typeof z === 'number' && !isNaN(z))) {
                        doubleCheck = false;
                        return false;
                    };
                });

                if (!doubleCheck) { return };

                addCab();

            });

        },//init end

    }

}();

$(document).ready(function () {
    Mike.init();

});