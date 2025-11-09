#!/usr/bin/env python3
"""
Modbus TCP Simulator for Iotistic Platform
Simulates industrial sensors with realistic data patterns
"""
import logging
import time
import random
import math
from pymodbus.server import StartTcpServer
from pymodbus.device import ModbusDeviceIdentification
from pymodbus.datastore import ModbusSequentialDataBlock, ModbusSlaveContext, ModbusServerContext

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SimulatedDataBlock(ModbusSequentialDataBlock):
    """Data block that generates realistic sensor values"""
    
    def __init__(self, address, values):
        super().__init__(address, values)
        self.start_time = time.time()
    
    def getValues(self, address, count=1):
        """Generate realistic sensor data on read"""
        elapsed = time.time() - self.start_time
        values = []
        
        for i in range(count):
            addr = address + i
            
            # Temperature sensors (registers 0-9): 20-30°C with sine wave
            if 0 <= addr < 10:
                base_temp = 25.0
                variation = 5.0 * math.sin(elapsed / 30.0 + addr * 0.5)
                noise = random.uniform(-0.5, 0.5)
                value = int((base_temp + variation + noise) * 10)  # Scale by 10
            
            # Pressure sensors (registers 10-19): 1000-1200 mbar
            elif 10 <= addr < 20:
                base_pressure = 1100
                variation = 50 * math.sin(elapsed / 45.0 + addr * 0.3)
                noise = random.uniform(-5, 5)
                value = int(base_pressure + variation + noise)
            
            # Flow sensors (registers 20-29): 0-100 L/min
            elif 20 <= addr < 30:
                base_flow = 50
                variation = 30 * math.sin(elapsed / 20.0 + addr * 0.7)
                noise = random.uniform(-2, 2)
                value = int(max(0, base_flow + variation + noise))
            
            # Humidity sensors (registers 30-39): 40-70%
            elif 30 <= addr < 40:
                base_humidity = 55
                variation = 15 * math.sin(elapsed / 60.0 + addr * 0.4)
                noise = random.uniform(-1, 1)
                value = int(max(0, min(100, base_humidity + variation + noise)))
            
            # Level sensors (registers 40-49): 0-1000 mm
            elif 40 <= addr < 50:
                base_level = 500
                variation = 200 * math.sin(elapsed / 40.0 + addr * 0.6)
                noise = random.uniform(-10, 10)
                value = int(max(0, min(1000, base_level + variation + noise)))
            
            # Power sensors (registers 50-59): 0-10000 W
            elif 50 <= addr < 60:
                base_power = 5000
                variation = 2000 * math.sin(elapsed / 25.0 + addr * 0.8)
                noise = random.uniform(-50, 50)
                value = int(max(0, base_power + variation + noise))
            
            # Vibration sensors (registers 60-69): 0-100 mm/s
            elif 60 <= addr < 70:
                base_vib = 20
                variation = 15 * math.sin(elapsed / 10.0 + addr * 1.2)
                spike = 30 if random.random() < 0.05 else 0  # Occasional spikes
                noise = random.uniform(-2, 2)
                value = int(max(0, base_vib + variation + spike + noise))
            
            # RPM sensors (registers 70-79): 1000-3000 RPM
            elif 70 <= addr < 80:
                base_rpm = 2000
                variation = 500 * math.sin(elapsed / 35.0 + addr * 0.5)
                noise = random.uniform(-20, 20)
                value = int(max(0, base_rpm + variation + noise))
            
            # Generic sensors (registers 80-99): 0-65535
            else:
                value = int(32768 + 10000 * math.sin(elapsed / 30.0 + addr))
            
            values.append(value)
        
        return values


def setup_server():
    """Configure Modbus server with simulated data"""
    
    # Create data blocks for each function code
    # Holding Registers (function code 3): 100 registers starting at address 0
    holding_registers = SimulatedDataBlock(0, [0] * 100)
    
    # Input Registers (function code 4): 50 registers starting at address 0
    input_registers = SimulatedDataBlock(0, [0] * 50)
    
    # Coils (function code 1): 20 coils starting at address 0
    # Simulate alarm states and digital inputs
    coils = ModbusSequentialDataBlock(0, [False] * 20)
    
    # Discrete Inputs (function code 2): 20 inputs starting at address 0
    discrete_inputs = ModbusSequentialDataBlock(0, [True, False] * 10)
    
    # Create slave context
    store = ModbusSlaveContext(
        di=discrete_inputs,
        co=coils,
        hr=holding_registers,
        ir=input_registers
    )
    
    # Create server context with single slave (unit ID 1)
    context = ModbusServerContext(slaves=store, single=True)
    
    # Device identification
    identity = ModbusDeviceIdentification()
    identity.VendorName = 'Iotistic'
    identity.ProductCode = 'MODSIM'
    identity.VendorUrl = 'https://iotistic.ca'
    identity.ProductName = 'Modbus TCP Simulator'
    identity.ModelName = 'Industrial Sensor Simulator'
    identity.MajorMinorRevision = '1.0.0'
    
    return context, identity


def main():
    """Start Modbus TCP server"""
    logger.info("Starting Modbus TCP Simulator")
    logger.info("Listening on port 502")
    logger.info("Available registers:")
    logger.info("  - Holding Registers 0-9: Temperature sensors (°C * 10)")
    logger.info("  - Holding Registers 10-19: Pressure sensors (mbar)")
    logger.info("  - Holding Registers 20-29: Flow sensors (L/min)")
    logger.info("  - Holding Registers 30-39: Humidity sensors (%)")
    logger.info("  - Holding Registers 40-49: Level sensors (mm)")
    logger.info("  - Holding Registers 50-59: Power sensors (W)")
    logger.info("  - Holding Registers 60-69: Vibration sensors (mm/s)")
    logger.info("  - Holding Registers 70-79: RPM sensors")
    logger.info("  - Coils 0-19: Digital I/O")
    
    context, identity = setup_server()
    
    try:
        StartTcpServer(
            context=context,
            identity=identity,
            address=("0.0.0.0", 502)
        )
    except KeyboardInterrupt:
        logger.info("Shutting down Modbus TCP Simulator")
    except Exception as e:
        logger.error(f"Error running server: {e}")


if __name__ == '__main__':
    main()
