$(document).ready(function() {
    $('.follow-form').on('submit', function(e) {
         e.preventDefault();
        const form = $(this);
        const button = form.find('button');
        const action = button.data('action');
        const followee = form.find('input[name="followee"]').val();

        $.ajax({
            url: '/follow',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ followee: followee, action: action }),
            success: function(response) {
                if (response.success) {
                    if (response.newAction === "unfollow") { //heißt wenn der User gerade gefolgt ist
                        button
                            .text("Entfolgen")
                            .removeClass("btn-primary")
                            .addClass("btn-warning")
                            .data("action", "unfollow");
                    } else { //wenn der user gerade entfolgt ist
                        button
                            .text("Folgen")
                            .removeClass("btn-warning")
                            .addClass("btn-primary")
                            .data("action", "follow");
                    }
                } else {
                    console.log("Fehler beim Folgen/Entfolgen");
                }
            },
            error: function() {
                console.log("Serverfehler");
            }
        });
    });
});
