// Make sure to install the necessary dependencies
const { CallClient, VideoStreamRenderer, LocalVideoStream } = require('@azure/communication-calling');
const { AzureCommunicationTokenCredential } = require('@azure/communication-common');
const { AzureLogger, setLogLevel } = require("@azure/logger");
const { ChatClient } = require('@azure/communication-chat');
// Set the log level and output
setLogLevel('verbose');
AzureLogger.log = (...args) => {
    console.log(...args);
};

// Calling web sdk objects
let callAgent;
let deviceManager;
let call;
let incomingCall;
let localVideoStream;
let localVideoStreamRenderer;
let chatClient;
let chatThreadClient;

// UI widgets
let userAccessToken = document.getElementById('user-access-token');
let threadIdInput = document.getElementById('thread-id-input');
let calleeAcsUserId = document.getElementById('callee-acs-user-id');
let initializeCallAgentButton = document.getElementById('initialize-call-agent');
let startCallButton = document.getElementById('start-call-button');
let hangUpCallButton = document.getElementById('hangup-call-button');
let acceptCallButton = document.getElementById('accept-call-button');
let startVideoButton = document.getElementById('start-video-button');
let stopVideoButton = document.getElementById('stop-video-button');
let startShareButton = document.getElementById('start-share-button');
let stopShareButton = document.getElementById('stop-share-button');
let connectedLabel = document.getElementById('connectedLabel');
let remoteVideosGallery = document.getElementById('remoteVideosGallery');
let localVideoContainer = document.getElementById('localVideoContainer');
//Chat UI widgets
const messagesContainer = document.getElementById("messages-container");
const chatBox = document.getElementById("chat-box");
const sendMessageButton = document.getElementById("send-message");
const messagebox = document.getElementById("message-box");

let endpointUrl = 'https://communicationservicessdas.communication.azure.com/';

var userId = '';
var messages = '';

/**
 * Using the CallClient, initialize a CallAgent instance with a CommunicationUserCredential which will enable us to make outgoing calls and receive incoming calls. 
 * You can then use the CallClient.getDeviceManager() API instance to get the DeviceManager.
 */

async function init() {
    try {
            const callClient = new CallClient(); 
            tokenCredential = new AzureCommunicationTokenCredential(userAccessToken.value.trim());
            callAgent = await callClient.createCallAgent(tokenCredential)
            // Set up a camera device to use.
            deviceManager = await callClient.getDeviceManager();
            await deviceManager.askDevicePermission({ video: true });
            await deviceManager.askDevicePermission({ audio: true });
            // Listen for an incoming call to accept.
            callAgent.on('incomingCall', async (args) => {
                try {
                    incomingCall = args.incomingCall;
                    acceptCallButton.disabled = false;
                    startCallButton.disabled = true;
                } catch (error) {
                    console.error(error);
                }
            });

            startCallButton.disabled = false;
            initializeCallAgentButton.disabled = true;

            chatClient = new ChatClient(endpointUrl, new AzureCommunicationTokenCredential(userAccessToken.value.trim()));

            
        } catch(error) {
            console.error(error);
        }
}

init();


startCallButton.onclick = async () => {
    try {
        const localVideoStream = await createLocalVideoStream();
        const videoOptions = localVideoStream ? { localVideoStreams: [localVideoStream] } : undefined;

        call = callAgent.join({ meetingLink: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_NTMyZDVhY2ItNDlmYy00OGVmLTk0M2EtNjhlMmU5NjYyNDlk%40thread.v2/0?context=%7b%22Tid%22%3a%2212437861-f55d-4e74-8b78-47996c60686a%22%2c%22Oid%22%3a%226afe78a7-2641-47d6-b4f9-358847d186c8%22%7d" }, {videoOptions});
    
    call.on('stateChanged', () => {
        connectedLabel.innerText = call.state;
    });

    chatBox.style.display = "block";
    hangUpCallButton.disabled = false;
    startCallButton.disabled = true;



    
	messagesContainer.innerHTML = messages;

	console.log(call);

	// open notifications channel
	await chatClient.startRealtimeNotifications();

	// subscribe to new message notifications
	chatClient.on("chatMessageReceived", (e) => {
		console.log("Notification chatMessageReceived!");

      // check whether the notification is intended for the current thread
		if (threadIdInput.value != e.threadId) {
			return;
		}

		if (e.sender.communicationUserId != userId) {
		   renderReceivedMessage(e.message);
		}
		else {
		   renderSentMessage(e.message);
		}
	});

    
    chatThreadClient = await chatClient.getChatThreadClient(threadIdInput.value);

    
        // Subscribe to the call's properties and events.
        console.log(call.state);
        subscribeToCall(call);
    } catch (error) {
        console.error(error);
    }
}

acceptCallButton.onclick = async () => {
    try {
        const localVideoStream = await createLocalVideoStream();
        const videoOptions = localVideoStream ? { localVideoStreams: [localVideoStream] } : undefined;
        call = await incomingCall.accept({ videoOptions });
        // Subscribe to the call's properties and events.
        subscribeToCall(call);
    } catch (error) {
        console.error(error);
    }
}


subscribeToCall = (call) => {
    try {
        // Inspect the initial call.id value.
        console.log(`Call Id: ${call.id}`);
        //Subscribe to call's 'idChanged' event for value changes.
        call.on('idChanged', () => {
            console.log(`Call Id changed: ${call.id}`); 
        });

        // Inspect the initial call.state value.
        console.log(`Call state: ${call.state}`);
        // Subscribe to call's 'stateChanged' event for value changes.
        call.on('stateChanged', async () => {
            console.log(`Call state changed: ${call.state}`);
            if(call.state === 'Connected') {
                connectedLabel.hidden = false;
                acceptCallButton.disabled = true;
                startCallButton.disabled = true;
                hangUpCallButton.disabled = false;
                startVideoButton.disabled = false;
                stopVideoButton.disabled = false;
                remoteVideosGallery.hidden = false;
            } else if (call.state === 'Disconnected') {
                connectedLabel.hidden = true;
                startCallButton.disabled = false;
                hangUpCallButton.disabled = true;
                startVideoButton.disabled = true;
                stopVideoButton.disabled = true;
                console.log(`Call ended, call end reason={code=${call.callEndReason.code}, subCode=${call.callEndReason.subCode}}`);
            }   
        });

        call.localVideoStreams.forEach(async (lvs) => {
            localVideoStream = lvs;
            await displayLocalVideoStream();
        });
        call.on('localVideoStreamsUpdated', e => {
            e.added.forEach(async (lvs) => {
                localVideoStream = lvs;
                await displayLocalVideoStream();
            });
            e.removed.forEach(lvs => {
               removeLocalVideoStream();
            });
        });
        
        // Inspect the call's current remote participants and subscribe to them.
        call.remoteParticipants.forEach(remoteParticipant => {
            subscribeToRemoteParticipant(remoteParticipant);
        });
        // Subscribe to the call's 'remoteParticipantsUpdated' event to be
        // notified when new participants are added to the call or removed from the call.
        call.on('remoteParticipantsUpdated', e => {
            // Subscribe to new remote participants that are added to the call.
            e.added.forEach(remoteParticipant => {
                subscribeToRemoteParticipant(remoteParticipant)
            });
            // Unsubscribe from participants that are removed from the call
            e.removed.forEach(remoteParticipant => {
                console.log('Remote participant removed from the call.');
            });
        });
    } catch (error) {
        console.error(error);
    }
}


subscribeToRemoteParticipant = (remoteParticipant) => {
    try {
        // Inspect the initial remoteParticipant.state value.
        console.log(`Remote participant state: ${remoteParticipant.state}`);
        // Subscribe to remoteParticipant's 'stateChanged' event for value changes.
        remoteParticipant.on('stateChanged', () => {
            console.log(`Remote participant state changed: ${remoteParticipant.state}`);
        });

        // Inspect the remoteParticipants's current videoStreams and subscribe to them.
        remoteParticipant.videoStreams.forEach(remoteVideoStream => {
            subscribeToRemoteVideoStream(remoteVideoStream)
        });
        // Subscribe to the remoteParticipant's 'videoStreamsUpdated' event to be
        // notified when the remoteParticiapant adds new videoStreams and removes video streams.
        remoteParticipant.on('videoStreamsUpdated', e => {
            // Subscribe to new remote participant's video streams that were added.
            e.added.forEach(remoteVideoStream => {
                subscribeToRemoteVideoStream(remoteVideoStream)
            });
            // Unsubscribe from remote participant's video streams that were removed.
            e.removed.forEach(remoteVideoStream => {
                console.log('Remote participant video stream was removed.');
            })
        });
    } catch (error) {
        console.error(error);
    }
}


subscribeToRemoteVideoStream = async (remoteVideoStream) => {
    let renderer = new VideoStreamRenderer(remoteVideoStream);
    let view;
    let remoteVideoContainer = document.createElement('div');
    remoteVideoContainer.className = 'remote-video-container';

    /**
     * isReceiving API is currently a @beta feature.
     * To use this api, please use 'beta' version of Azure Communication Services Calling Web SDK.
     * Create a CSS class to style your loading spinner.
     *
    let loadingSpinner = document.createElement('div');
    loadingSpinner.className = 'loading-spinner';
    remoteVideoStream.on('isReceivingChanged', () => {
        try {
            if (remoteVideoStream.isAvailable) {
                const isReceiving = remoteVideoStream.isReceiving;
                const isLoadingSpinnerActive = remoteVideoContainer.contains(loadingSpinner);
                if (!isReceiving && !isLoadingSpinnerActive) {
                    remoteVideoContainer.appendChild(loadingSpinner);
                } else if (isReceiving && isLoadingSpinnerActive) {
                    remoteVideoContainer.removeChild(loadingSpinner);
                }
            }
        } catch (e) {
            console.error(e);
        }
    });
    */

    const createView = async () => {
        // Create a renderer view for the remote video stream.
        view = await renderer.createView();
        // Attach the renderer view to the UI.
        remoteVideoContainer.appendChild(view.target);
        remoteVideosGallery.appendChild(remoteVideoContainer);
    }

    // Remote participant has switched video on/off
    remoteVideoStream.on('isAvailableChanged', async () => {
        try {
            if (remoteVideoStream.isAvailable) {
                await createView();
            } else {
                view.dispose();
                remoteVideosGallery.removeChild(remoteVideoContainer);
            }
        } catch (e) {
            console.error(e);
        }
    });

    // Remote participant has video on initially.
    if (remoteVideoStream.isAvailable) {
        try {
            await createView();
        } catch (e) {
            console.error(e);
        }
    }
}

/**
 * Start your local video stream.
 * This will send your local video stream to remote participants so they can view it.
 */
startVideoButton.onclick = async () => {
    try {
        const localVideoStream = await createLocalVideoStream();
        await call.startVideo(localVideoStream);
    } catch (error) {
        console.error(error);
    }
}


stopVideoButton.onclick = async () => {
    try {       
        await call.stopVideo(localVideoStream);
    } catch (error) {
        console.error(error);
    }
}

startShareButton.onclick = async () => {
    try {
        await call.startScreenSharing();
    } catch (error) {
        console.error(error);
    }
}


stopShareButton.onclick = async () => {
    try {       
        await call.stopScreenSharing();
    } catch (error) {
        console.error(error);
    }
}

createLocalVideoStream = async () => {
    const camera = (await deviceManager.getCameras())[0];
    if (camera) {
        return new LocalVideoStream(camera);
    } else {
        console.error(`No camera device found on the system`);
    }
}

//call.isScreenSharingOn;
// call.on('isScreenSharingOnChanged', () => {
//     // Callback();
// });
// // Unsubscribe from screen share event
// call.off('isScreenSharingOnChanged', () => {
//     // Callback();
// });

displayLocalVideoStream = async () => {
    try {
        localVideoStreamRenderer = new VideoStreamRenderer(localVideoStream);
        const view = await localVideoStreamRenderer.createView();
        localVideoContainer.hidden = false;
        localVideoContainer.appendChild(view.target);
    } catch (error) {
        console.error(error);
    } 
}

/**
 * Remove your local video stream preview from your UI
 */
removeLocalVideoStream = async() => {
    try {
        localVideoStreamRenderer.dispose();
        localVideoContainer.hidden = true;
    } catch (error) {
        console.error(error);
    } 
}

/**
 * End current call
 */
hangUpCallButton.addEventListener("click", async () => {
    // end the current call
    await call.hangUp();
});

///Chat Component

async function renderReceivedMessage(message) {
	messages += '<div class="container lighter">' + message + '</div>';
	messagesContainer.innerHTML = messages;
}

async function renderSentMessage(message) {
	messages += '<div class="container darker">' + message + '</div>';
	messagesContainer.innerHTML = messages;
}

sendMessageButton.addEventListener("click", async () =>
	{
		let message = messagebox.value;

		let sendMessageRequest = { content: message };
		let sendMessageOptions = { senderDisplayName : 'Jack' };
		let sendChatMessageResult = await chatThreadClient.sendMessage(sendMessageRequest, sendMessageOptions);
		let messageId = sendChatMessageResult.id;

		messagebox.value = '';
		console.log(`Message sent!, message id:${messageId}`);
	});