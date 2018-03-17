'use strict';

const Homey = require('homey');

const SCAN_INTERVAL = 1000 * 60 * 5; // 5 min
const DATA_SERVICE_UUID = '0000120400001000800000805f9b34fb';
const DATA_CHARACTERISTIC_UUID = '00001a0100001000800000805f9b34fb';

class FloraDriver extends Homey.Driver {
	
	onInit() {
		this.log('FloraDriver has been inited');
		this.scan();
		this._scanInterval = setInterval( this.scan.bind(this), SCAN_INTERVAL );
		
		this._advertisements = {};
	}
	
	onPair( socket ) {
		socket.on('list_devices', ( data, callback ) => {
			let devices = [];
			for( let advertisementAddress in this._advertisements ) {
				let advertisement = this._advertisements[advertisementAddress];
				devices.push({
					name: advertisement.localName,
					data: {
						address: advertisementAddress,
					}
				})
			}
			callback( null, devices );
		})
	}
	
	scan() {
		this.log('Scanning for Flora devices...');
		
		Homey.ManagerBLE.discover()
			.then( advertisements => {
				if( advertisements.length === 0 )
					this.log('Found no devices');
					
				return advertisements.filter(advertisement => {
					if( advertisement.localName === 'Flower care' ) return true;
					return false;
				})
			})
			.then( advertisements => {
				advertisements.forEach(advertisement => {
					if( this._advertisements[advertisement.address] ) return;
					
					this.log('Found a device', advertisement.address);
					
					this._advertisements[advertisement.address] = advertisement;
					
					process.nextTick(() => {
						this.emit('advertisement', advertisement);
						this.emit(`advertisement:${advertisement.address}`, advertisement)
					});
				})
			})
			.catch( this.error )
		
	}
	
	async getFloraDeviceData( advertisementAddress ) {
		let advertisement = this._advertisements[advertisementAddress];
		if( !advertisement ) throw new Error('Invalid Device Address');
		
		let disconnect;
		
		return advertisement.connect()
			.then( peripheral => {
				
				disconnect = () => {
					process.nextTick(() => {
						peripheral.disconnect(() => {})
					})
				}
				
				return peripheral.discoverServices();
			})
			.then( services => {
				for( let i = 0; i < services.length; i++ ) {
					let service = services[i];
					if( service.uuid === DATA_SERVICE_UUID ) return service;
				}
				throw new Error('Missing data service');
			})
			.then( dataService => {
				return dataService.discoverCharacteristics();
			})
			.then( characteristics => {
				for( let i = 0; i < characteristics.length; i++ ) {
					let characteristic = characteristics[i];
					if( characteristic.uuid === DATA_CHARACTERISTIC_UUID ) return characteristic;
				}
				throw new Error('Missing data characteristic');
			})
			.then( characteristic => {
				return characteristic.read();
			})
			.then( data => {
				let temperature = data.readUInt16LE(0) / 10;
				let luminance = data.readUInt32LE(3);
				let moisture = data.readUInt16BE(6);
				let fertility = data.readUInt16LE(8);
				
				disconnect();
				
				return {
					temperature,
					luminance,
					moisture,
					fertility,
				}
			})
			.catch( err => {
				disconnect();
				throw err;
			})
		
	}
	
}

module.exports = FloraDriver;