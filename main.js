const electron = require('electron');
const url = require('url');
const path = require('path');
const net = require('net');
const ejse = require('ejs-electron');
var client = new net.Socket();
var crypto = require('crypto');

const {app, BrowserWindow, Menu, ipcMain} = electron;

const ipc = require('electron').ipcRenderer
const Store = require('electron-store');
const store = new Store();

let mainWindow;
const createModal = (page_url, width, height) => {
	let modal = new BrowserWindow({
		width: width,
		height: height,
		modal: true
	})

	modal.loadURL(page_url)

	return modal;
  
}

let nativeMenus = [
	{
		label: 'Help',
		submenu: [
			{
				label: 'Diagonstic Tool',
				click() {
					let linkFile = "diagonstic.ejs";
					mainWindow.loadFile(linkFile);
				}
			},
			{
				label: 'Settings',
				click() {
					//if(logged_in_user_role === 1) {
						let linkFile = "settings-page.ejs";
						mainWindow.loadFile(linkFile, {query: {"role": logged_in_user_role}});
					// } else {
					// 	let linkFile = "login.ejs";
					// 	mainWindow.loadFile(linkFile);
					// }
				}
			},
			{
				label: 'Dev Tools',
				click() {
					mainWindow.webContents.openDevTools();
				}
			}
		]
	}
];


function logOutUser() {
	nativeMenus[0].submenu.pop();

	menu = Menu.buildFromTemplate(nativeMenus);
	Menu.setApplicationMenu(menu);

	logged_in_user_role = 3;
	logged_in_user_name = "BlueCrest Supervisor";
	mainWindow.loadFile("general-view.ejs");
}

let menu = Menu.buildFromTemplate(nativeMenus)
Menu.setApplicationMenu(menu)

//app ready listener
app.on('ready', function() {
    //creating new window
    mainWindow = new BrowserWindow({
        width: 1282,
        height: 1080,
        resizable: false,
        webPreferences: {
			nodeIntegration: true,
			devTools: true
        }
    });

    /* mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, "main-window.html"),
        protocol: 'file:',
        slashes: true
	})); */
	
	mainWindow.loadFile('general-view.ejs');

});

//Processing socket processes
let previouslyConnected = 0;
let alreadyConnected = 0;
let currentConnectedMachine = 0;
/* const port = 10707;
const host = "192.168.1.102"; */
let port = store.get("ingram_server_port", "not_set");
let host = store.get("ingram_server_address", "not_set");
let cmAddress = store.get("ingram_cm_address", "not_set");
/* const port = 50555;
const host = "192.168.0.104"; */
const timeout = 1000;
let retrying = false;
let machineList = {};
let maintenanceIpList = {};
let ipList, connectionStatus;
let logged_in_user_role = 3;
let logged_in_user_name = "BlueCrest Supervisor";

// Functions to handle socket events
function makeConnection () {
	if(alreadyConnected == 0) {
		//console.log(port + " - " + host);
		if((port != "not_set") && (host != "not_set")) {
			client.connect(port, host);
		}
	}
}


function generateIpListHtml() {
	let returnHtml = '<option value="">Select machine</option>';
	for (let k in ipList) {
		//console.log(k + " " + ipList[k]);
		returnHtml += '<option value="'+ k +'">' + ipList[k].ip_address + '</option>';
		/* if(cmAddress == ipList[k].ip_address) {
			currentConnectedMachine = k;
		} */
	}

	return returnHtml;
}


function getStoredValue(key_name) {
	return store.get(key_name, "not_set");
}

/* client.on('connect', () => {
	clearIntervalConnect();
	//client.setKeepAlive(true, 30000);
	console.log('Connected to server');
	if(previouslyConnected == 0) {
		previouslyConnected = 1;
		let m = {"req" : "send_ip_list"};
		sendMessageToServer(JSON.stringify(m));
	}
}); */

function connectEventHandler() {
	//console.log('connected');
	alreadyConnected = 1;
	retrying = false;
	mainWindow.webContents.send("render:server_connected");
	connectionStatus = setInterval(() => {
		if(currentConnectedMachine != 0) {
			//console.log("sending device status check message");		
			let m = {"req" : "device_status", "id" : currentConnectedMachine};
			sendMessageToServer(JSON.stringify(m));
		}
	}, 2000);

	if(previouslyConnected == 0) {
		previouslyConnected = 1;
		let m = {"req" : "send_ip_list"};
		sendMessageToServer(JSON.stringify(m));
	}
}

function processReceivedJsonObjects(jsonObjects) {
	jsonObjects.forEach(function(jsonObj) {
		if(jsonObj.type != undefined) {
			let resType = jsonObj.type;

			if(resType == "ip_list") {
				machineList = {};
				maintenanceIpList = {};
				ipList = jsonObj.result;
				let ipListHtml = generateIpListHtml();
				//let ipListHtml = '<option value="">Select machine</option>';
				for (let k in ipList) {
					//console.log(k + " " + ipList[k]);
					//ipListHtml += '<option value="'+ k +'">' + ipList[k].ip_address + '</option>';
					machineList[k] = ipList[k].machine_name;
					maintenanceIpList[k] = ipList[k].maintenance_ip;
				}
				mainWindow.webContents.send("render:ip_list", ipListHtml, machineList, maintenanceIpList);

			} else if(resType == "general_view") {
				let generalViewResult = jsonObj.result;
				mainWindow.webContents.send("render:general_view", generalViewResult);
			} else if(resType == "alarms_list") {
				let alarmsListResult = jsonObj.result;
				mainWindow.webContents.send("render:alarms_list", alarmsListResult);
			} else if(resType == "alarms_history") {
				let alarmsHistoryResult = jsonObj.result.history;
				let alarmDataResult = jsonObj.result.data;
				let machine_mode = jsonObj.result.mode;
				mainWindow.webContents.send("render:alarms_history", alarmsHistoryResult, alarmDataResult, machine_mode);
			} else if(resType == "alarms_hit_list") {
				let alarmsHitListResult = jsonObj.result.history;
				let alarmDataResult = jsonObj.result.data;
				let machine_mode = jsonObj.result.mode;
				mainWindow.webContents.send("render:alarms_hit_list", alarmsHitListResult, alarmDataResult, machine_mode);
			} else if(resType == "status") {
				let statusViewResult = jsonObj.result;
				mainWindow.webContents.send("render:status", statusViewResult);
			} else if(resType == "mod_sort") {
				let modSortResult = jsonObj.result;
				mainWindow.webContents.send("render:mod_sort", modSortResult);
			} else if(resType == "induct") {
				let inductResult = jsonObj.result;
				mainWindow.webContents.send("render:induct", inductResult);
			} else if(resType == "statistics") {
				let statisticsViewResult = jsonObj.result;
				mainWindow.webContents.send("render:statistics", statisticsViewResult);
			} else if(resType == "device_status") {
				let deviceStatusResult = jsonObj.result;
				//console.log(deviceStatusResult);
				mainWindow.webContents.send("render:device_status", deviceStatusResult);
			}  else if(resType == "device_titles") {
				let deviceTitlesResult = jsonObj.result;
				//console.log(deviceTitlesResult);
				mainWindow.webContents.send("render:device_titles", deviceTitlesResult);
			} else if(resType == "package_list") {
				let packageListResult = jsonObj.result;
				//console.log(deviceTitlesResult);
				mainWindow.webContents.send("render:package_list", packageListResult);
			}
			else if(resType == "statistics-package-to-sort") {
				let ingramProducts = jsonObj.ingramProducts;
				//console.log(ingramProducts);
				mainWindow.webContents.send("render:statistics-package-to-sort", ingramProducts);
			}
			else if(resType == "sorted_graphs") {
				let sortedGraphResult = jsonObj.result;
				//console.log(deviceTitlesResult);
				mainWindow.webContents.send("render:sorted_graphs", sortedGraphResult);
			} else if(resType == "settings") {
				let settingResult = jsonObj.result;
				//console.log(deviceTitlesResult);
				mainWindow.webContents.send("render:settings", settingResult);
			}
			else if(resType == "login_user") {
				let loginResult = jsonObj.result;

				if(loginResult['success'] === 1) {
					//console.log("LOGGED IN OK ->" + nativeMenus[0].submenu[3].enabled);
					nativeMenus[0].submenu.push({
						label: 'Logout',
						click() {
							logOutUser();
						}
					});

					menu = Menu.buildFromTemplate(nativeMenus);
					Menu.setApplicationMenu(menu);
				}

				//console.log(deviceTitlesResult);
				mainWindow.webContents.send("render:login_result", loginResult);
			}
			//messageId==4
			else if(resType == "status:ActiveAlarms") {
				let  machineId=jsonObj.machineId;
				let activeAlarms=jsonObj.activeAlarms;
				mainWindow.webContents.send("status:ActiveAlarms",machineId, activeAlarms);
			}
			
		}
	});
}

let chunk = "";
const DELIMITER = (';#;#;');
function dataEventHandler(data) {
	let jsonData;
	let jsonObjects;
	chunk += data.toString(); // Add string on the end of the variable 'chunk'
    d_index = chunk.indexOf(DELIMITER); // Find the delimiter

    // While loop to keep going until no delimiter can be found
    while (d_index > -1) {
        try {
            jsonData = chunk.substring(0,d_index); // Create string up until the delimiter
			//jsonObjects = JSON.parse(jsonData); // Parse the current string
			jsonObjects = JSON.parse('[' + jsonData.replace(/\}\s*\{/g, '},{') + ']')
            processReceivedJsonObjects(jsonObjects); // Function that does something with the current chunk of valid json.        
		}catch(er) {
			console.log("Error happened in main again");
			console.log(jsonData);
		}
		
        chunk = chunk.substring(d_index+DELIMITER.length); // Cuts off the processed chunk
        d_index = chunk.indexOf(DELIMITER); // Find the new delimiter
    }
}

function endEventHandler() {
    console.log('end');
}

function timeoutEventHandler() {
    // console.log('timeout');
}

function drainEventHandler() {
    // console.log('drain');
}

function errorEventHandler(err) {
	console.log('error');
	console.log(err);
}

function closeEventHandler () {
	//have to handle it
	mainWindow.webContents.send("render:server_disconnected");
	// console.log('close');
	clearInterval(connectionStatus);
	alreadyConnected = 0;
    if (!retrying) {
        retrying = true;
        console.log('Reconnecting...');
	}
	console.log("Trying to connect");
    setTimeout(makeConnection, timeout);
}

// Create socket and bind callbacks
client.on('connect', connectEventHandler);
client.on('data',    dataEventHandler);
client.on('end',     endEventHandler);
client.on('timeout', timeoutEventHandler);
client.on('drain',   drainEventHandler);
client.on('error',   errorEventHandler);
client.on('close',   closeEventHandler);

//0 for welcome
function sendMessageToServer(msg) {
	client.write(msg);
}

ipcMain.on("connect:server", function(e) {
	makeConnection();
});

ipcMain.on("get:views", function(e, machineId, view_name) {

	currentConnectedMachine = machineId;
	if((machineId != 0) && (view_name != "diagonstics")) {
		let m = {"req" : view_name, "id" : machineId};
		sendMessageToServer(JSON.stringify(m));
	}
});

ipcMain.on("get:change_mode", function(e, machineId, mode) {
	currentConnectedMachine = machineId;
	if((machineId != 0)) {
		let m = {"req" : "change_mode", "id" : machineId, "mode" : mode};
		sendMessageToServer(JSON.stringify(m));
	}
});

ipcMain.on("get:change_induct", function(e, machineId, mode, inductId) {
	currentConnectedMachine = machineId;
	if((machineId != 0)) {
		let m = {"req" : "change_induct", "id" : machineId, "mode" : mode, "induct" : inductId};
		sendMessageToServer(JSON.stringify(m));
	}
});

ipcMain.on("get:mod_sort", function(e, machineId, device_type, device_number) {
	currentConnectedMachine = machineId;
	if((machineId != 0)) {
		let m = {"req" : "mod_sort", "id" : machineId, "device_type" : device_type, "device_number": device_number};
		sendMessageToServer(JSON.stringify(m));
	}
});

ipcMain.on("get:induct", function(e, machineId, induct_number) {
	currentConnectedMachine = machineId;
	if((machineId != 0)) {
		let m = {"req" : "induct", "id" : machineId, "induct_number": induct_number};
		sendMessageToServer(JSON.stringify(m));
	}
});

//ipcRenderer.send("get:change_bin_mode", selected_machine, bin_id, changed_bin_mode);

ipcMain.on("get:change_bin_mode", function(e, machineId, binId, mode) {
	currentConnectedMachine = machineId;
	if((machineId != 0) && (binId != 0)) {
		let m = {"req" : "change_bin_mode", "machine" : machineId, "bin" : binId, "mode" : mode};
		sendMessageToServer(JSON.stringify(m));
	}
});

ipcMain.on("get:device_command", function(e, machineId, device_id, operation_id) {
	currentConnectedMachine = machineId;
	if((machineId != 0)) {
		let m = {"req" : "device_command", "id" : machineId, "device" : device_id, "operation" : operation_id};
		sendMessageToServer(JSON.stringify(m));
	}
});

ipcMain.on("get:filtered_package_list", function(e, machineId, start_timestamp, end_timestamp, filter_sorting_code) {
	currentConnectedMachine = machineId;
	if((machineId != 0) && (start_timestamp !== "") && (end_timestamp !== "")) {
		let m = {"req" : "filtered_package_list", "id" : machineId, "start" : start_timestamp, "end" : end_timestamp, "sc" : filter_sorting_code};
		sendMessageToServer(JSON.stringify(m));
	}
});
ipcMain.on("get:filtered_package_to_sort_list", function(e, machineId, cartonId) {
	currentConnectedMachine = machineId;
	//console.log(machineId+" "+cartonId)
	//if((machineId != 0) && (cartonId !== "")) {
	if((machineId != 0) ) {
		let m = {"req" : "filtered_package_to_sort_list", "id" : machineId, "cartonId" : cartonId};
		sendMessageToServer(JSON.stringify(m));
	}
});


ipcMain.on("get:filtered_alarm_history", function(e, machineId, start_timestamp, end_timestamp) {
	currentConnectedMachine = machineId;
	if((machineId != 0) && (start_timestamp !== "") && (end_timestamp !== "")) {
		let m = {"req" : "filtered_alarm_history", "id" : machineId, "start" : start_timestamp, "end" : end_timestamp};
		sendMessageToServer(JSON.stringify(m));
	}
});

ipcMain.on("get:filtered_alarm_hit_list", function(e, machineId, start_timestamp, end_timestamp) {
	currentConnectedMachine = machineId;
	if((machineId != 0) && (start_timestamp !== "") && (end_timestamp !== "")) {
		let m = {"req" : "filtered_alarm_hit_list", "id" : machineId, "start" : start_timestamp, "end" : end_timestamp};
		sendMessageToServer(JSON.stringify(m));
	}
});

ipcMain.on("change:link", function(e, link) {
	let linkFile = link + ".ejs";
	mainWindow.loadFile(linkFile);
});

ipcMain.on("change:modsort", function(e, device_type, sorter_number, device_number) {
	//console.log(link);
	let linkFile = "divert.ejs";
	mainWindow.loadFile(linkFile, {query: {"device_type": device_type, "sorter_number": sorter_number, "device_number": device_number}});
});

ipcMain.on("change:induct", function(e, induct_id) {
	let linkFile = "inducts.ejs";
	mainWindow.loadFile(linkFile, {query: {"induct_number": induct_id}});
});

ipcMain.on("page:loaded", function(e) {
	let ipListHtml = generateIpListHtml();
	mainWindow.webContents.send("link:changed", ipListHtml, machineList, currentConnectedMachine, maintenanceIpList, logged_in_user_name);
});
ipcMain.on("status:ActiveAlarms", function(e,machineId) {
	if(machineId>0){
		let m = {"req" : 'status:ActiveAlarms', "machineId" : machineId};
		sendMessageToServer(JSON.stringify(m));
	}
});


ipcMain.on("settings:saved", function(e, settings_data) {
	//console.log(settings_data);

	store.set("ingram_server_address", settings_data['ip_address_input']);
	host = settings_data['ip_address_input'];

	store.set("ingram_server_port", settings_data['port_input']);
	port = settings_data['port_input'];

	store.set("ingram_cm_address", settings_data['cm_ip_address_input']);
	cmAddress = settings_data['cm_ip_address_input'];

	store.set("ingram_diagonstic_url", settings_data['diagonstic_url']);
	if (typeof settings_data['detailed_active_alarm'] !== 'undefined') {
		store.set("ingram_detailed_active_alarm", settings_data['detailed_active_alarm']);
	} else {
		store.set("ingram_detailed_active_alarm", "not_set");
	}
	store.set("ingram_default_general_view_name", settings_data['default_general_view_name']);
	//store.set("host", settings_data.ip_address_input);
});

ipcMain.on("get:login_user", function(e, machineId, username, password) {
	currentConnectedMachine = machineId;
	if((username !== "") && (password !== "")) {
		var md5Hash = crypto.createHash('md5').update(password).digest('hex');
		var sha1Hash = crypto.createHash('sha1').update(md5Hash).digest('hex');
		//console.log(sha1Hash); // 9b74c9897bac770ffc029102a200c5de
		let m = {"req" : "login_user", "id" : machineId, "username" : username, "password" : sha1Hash};
		sendMessageToServer(JSON.stringify(m));
	}
});

ipcMain.on("get:set_user_role", function(e, role, name) {
	logged_in_user_role = role;
	logged_in_user_name = name;
	if(logged_in_user_role === 1)
		mainWindow.loadFile("settings-page.ejs", {query: {"role": logged_in_user_role}});
	else
		mainWindow.loadFile("general-view.ejs");
});

ipcMain.handle('getStoreValue', (e) => {
	let server_address = store.get("ingram_server_address", "not_set");
	let server_port = store.get("ingram_server_port", "not_set");
	let diagonstic_url = store.get("ingram_diagonstic_url", "not_set");
	let cm_address = store.get("ingram_cm_address", "not_set");
	let detailed_active_alarm = store.get("ingram_detailed_active_alarm", "not_set");
	let default_general_view_name = store.get("ingram_default_general_view_name", "not_set");
	//store.set("host", settings_data.ip_address_input);

	return {
		"ip_address_input" : server_address,
		"port_input" : server_port,
		"diagonstic_url" : diagonstic_url,
		"cm_ip_address_input" : cm_address,
		"detailed_active_alarm" : detailed_active_alarm,
		"default_general_view_name" : default_general_view_name
	};
});

ipcMain.handle('getSingleStoreValue', (event, key) => {
	return store.get(key, "not_set");
});