require("dotenv").config();
const moment = require("moment");
const request = require("request-promise-native");

const apiUrl = "https://api.sipgate.com/v1";
const NO_OP = () => {};
const email = process.env.EMAIL;
const password = process.env.PASSWORD;

const getAccessToken = (email, password) =>
    request({
        uri: `${apiUrl}/authorization/token`,
        method: "POST",
        body: {
            username: email,
            password
        },
        json: true
    }).then(result => result.token);

const getHistory = (accessToken, userId = "w0") =>
    request({
        uri: `${apiUrl}/${userId}/history`,
        qs: {
            types: "VOICEMAIL"
        },
        headers: {
            "User-Agent": "Request-Promise",
            authorization: `Bearer ${accessToken}`
        },
        json: true
    });

const getNewVoiceMails = (
    since = moment(0),
    onPolling = NO_OP,
    onNewVoiceMails = NO_OP
) => {
    getAccessToken(email, password)
        .then(accessToken => {
            getHistory(accessToken)
                .then(result => {
                    const newItems = result.items.filter(
                        item => moment(item.created) - since > 0
                    );
                    if (newItems.length > 0) {
                        onNewVoiceMails(newItems);
                    }

                    const mostRecentItem = result.items
                        .map(item => moment(item.created))
                        .reduce((current, acc) => moment.max(current, acc), since);
                    onPolling(mostRecentItem);
                })
                .catch(error => console.error("Unable to retrieve history", error));
        })
        .catch(error => console.error("Unable to retrieve access token", error));
};

const watchVoiceMails = (onNewVoiceMails = NO_OP) => {
    let mostRecentHistoryItem = moment(0);

    getNewVoiceMails(mostRecentHistoryItem, mostRecentItem => {
        mostRecentHistoryItem = mostRecentItem;
        setInterval(
            () =>
                getNewVoiceMails(
                    mostRecentHistoryItem,
                    mostRecentItem => {
                        mostRecentHistoryItem = mostRecentItem;
                    },
                    onNewVoiceMails
                ),
            process.env.POLLING_INTERVAL_MS || 60000
        );
    });
};

watchVoiceMails(voiceMails => {
    voiceMails.forEach(voiceMail => {
        console.log(`You received a new voicemail from ${voiceMail.source}, saying: "${voiceMail.transcription}".
You can retrieve it from ${voiceMail.recordingUrl}.`);
    });
});
