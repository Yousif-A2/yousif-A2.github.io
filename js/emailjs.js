function sendMail() {
    var params = {
        name: document.getElementById("name").value,
        email: document.getElementById("email").value,
        project: document.getElementById("project").value,
        message: document.getElementById("message").value,
    };

    const serviceID = "service_ggbvg6n";
    const templateID = "template_seq3md2";

    emailjs
        .send(serviceID, templateID, params)
        .then((res) => {
            document.getElementById("name").value = "";
            document.getElementById("email").value = "";
            document.getElementById("project").value = "";
            document.getElementById("message").value = "";
            console.log("success", res.status);
            alert("Message Sent, We will get back to you shortly", res.status);
        })
        .catch((err) => console.log(err));
}
