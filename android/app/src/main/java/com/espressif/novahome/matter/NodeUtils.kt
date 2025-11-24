/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.matter

object NodeUtils {
    
    const val MATTER_DEVICE_ON_OFF_LIGHT = 0x0100        // On/Off Light
    const val MATTER_DEVICE_DIMMABLE_LIGHT = 0x0101      // Dimmable Light  
    const val MATTER_DEVICE_COLOR_TEMP_LIGHT = 0x010C    // Color Temperature Light
    const val MATTER_DEVICE_EXTENDED_COLOR_LIGHT = 0x010D // Extended Color Light
    const val MATTER_DEVICE_GENERIC_SWITCH = 0x000F      // Generic Switch
    const val MATTER_DEVICE_ON_OFF_SWITCH = 0x0103       // On/Off Light Switch
    const val MATTER_DEVICE_DIMMER_SWITCH = 0x0104       // Dimmer Switch
    const val MATTER_DEVICE_COLOR_DIMMER_SWITCH = 0x0105 // Color Dimmer Switch
    const val MATTER_DEVICE_CONTACT_SENSOR = 0x0015      // Contact Sensor
    const val MATTER_DEVICE_LIGHT_SENSOR = 0x0106        // Light Sensor
    const val MATTER_DEVICE_OCCUPANCY_SENSOR = 0x0107    // Occupancy Sensor
    const val MATTER_DEVICE_ON_OFF_OUTLET = 0x010A       // On/Off Plug-in Unit
    const val MATTER_DEVICE_DOOR_LOCK = 0x000A           // Door Lock
    const val MATTER_DEVICE_DOOR_LOCK_CONTROLLER = 0x000B // Door Lock Controller
    const val MATTER_DEVICE_THERMOSTAT = 0x0301          // Thermostat
    const val MATTER_DEVICE_TEMP_SENSOR = 0x0302         // Temperature Sensor
    const val MATTER_DEVICE_HUMIDITY_SENSOR = 0x0307     // Relative Humidity Sensor
    const val MATTER_DEVICE_FLOW_SENSOR = 0x0306         // Flow Sensor
    const val MATTER_DEVICE_PRESSURE_SENSOR = 0x0305     // Pressure Sensor
    const val MATTER_DEVICE_WINDOW_COVERING = 0x0202     // Window Covering
    const val MATTER_DEVICE_WINDOW_COVERING_CONTROLLER = 0x0203 // Window Covering Controller
    const val MATTER_DEVICE_HEATING_COOLING_UNIT = 0x0300 // Heating/Cooling Unit
    const val MATTER_DEVICE_FAN = 0x002B                 // Fan
    const val MATTER_DEVICE_AIR_PURIFIER = 0x002D        // Air Purifier
    const val MATTER_DEVICE_AIR_QUALITY_SENSOR = 0x002C  // Air Quality Sensor
    const val MATTER_DEVICE_SPEAKER = 0x0022             // Speaker
    const val MATTER_DEVICE_VIDEO_PLAYER = 0x0023        // Video Player
    const val MATTER_DEVICE_CASTING_VIDEO_PLAYER = 0x0024 // Casting Video Player
    const val MATTER_DEVICE_GENERIC_DEVICE = 0x0016      // Generic device fallback

    fun getDefaultNameForMatterDevice(deviceType: Int): String {
        return when (deviceType) {
            MATTER_DEVICE_ON_OFF_LIGHT, 
            MATTER_DEVICE_DIMMABLE_LIGHT, 
            MATTER_DEVICE_COLOR_TEMP_LIGHT,
            MATTER_DEVICE_EXTENDED_COLOR_LIGHT -> "Light"
            
            MATTER_DEVICE_GENERIC_SWITCH,
            MATTER_DEVICE_ON_OFF_SWITCH,
            MATTER_DEVICE_DIMMER_SWITCH,
            MATTER_DEVICE_COLOR_DIMMER_SWITCH -> "Switch"
            
            MATTER_DEVICE_CONTACT_SENSOR -> "Contact Sensor"
            MATTER_DEVICE_LIGHT_SENSOR -> "Light Sensor"
            MATTER_DEVICE_OCCUPANCY_SENSOR -> "Occupancy Sensor"
            MATTER_DEVICE_TEMP_SENSOR -> "Temperature Sensor"
            MATTER_DEVICE_HUMIDITY_SENSOR -> "Humidity Sensor"
            MATTER_DEVICE_FLOW_SENSOR -> "Flow Sensor"
            MATTER_DEVICE_PRESSURE_SENSOR -> "Pressure Sensor"
            MATTER_DEVICE_AIR_QUALITY_SENSOR -> "Air Quality Sensor"
            
            MATTER_DEVICE_ON_OFF_OUTLET -> "Outlet"
            MATTER_DEVICE_DOOR_LOCK -> "Door Lock"
            MATTER_DEVICE_DOOR_LOCK_CONTROLLER -> "Door Lock Controller"
            MATTER_DEVICE_THERMOSTAT -> "Thermostat"
            MATTER_DEVICE_HEATING_COOLING_UNIT -> "HVAC Unit"
            
            MATTER_DEVICE_WINDOW_COVERING -> "Window Covering"
            MATTER_DEVICE_WINDOW_COVERING_CONTROLLER -> "Window Controller"
            
            MATTER_DEVICE_FAN -> "Fan"
            MATTER_DEVICE_AIR_PURIFIER -> "Air Purifier"
            
            MATTER_DEVICE_SPEAKER -> "Speaker"
            MATTER_DEVICE_VIDEO_PLAYER -> "Video Player"
            MATTER_DEVICE_CASTING_VIDEO_PLAYER -> "Casting Player"
            
            else -> "Matter Device" // Default fallback for unknown types
        }
    }

    fun getDeviceCategory(deviceType: Int): String {
        return when (deviceType) {
            MATTER_DEVICE_ON_OFF_LIGHT, 
            MATTER_DEVICE_DIMMABLE_LIGHT, 
            MATTER_DEVICE_COLOR_TEMP_LIGHT,
            MATTER_DEVICE_EXTENDED_COLOR_LIGHT -> "Lighting"
            
            MATTER_DEVICE_GENERIC_SWITCH,
            MATTER_DEVICE_ON_OFF_SWITCH,
            MATTER_DEVICE_DIMMER_SWITCH,
            MATTER_DEVICE_COLOR_DIMMER_SWITCH -> "Switches"
            
            MATTER_DEVICE_CONTACT_SENSOR,
            MATTER_DEVICE_LIGHT_SENSOR,
            MATTER_DEVICE_OCCUPANCY_SENSOR,
            MATTER_DEVICE_TEMP_SENSOR,
            MATTER_DEVICE_HUMIDITY_SENSOR,
            MATTER_DEVICE_FLOW_SENSOR,
            MATTER_DEVICE_PRESSURE_SENSOR,
            MATTER_DEVICE_AIR_QUALITY_SENSOR -> "Sensors"
            
            MATTER_DEVICE_ON_OFF_OUTLET -> "Outlets"
            
            MATTER_DEVICE_DOOR_LOCK,
            MATTER_DEVICE_DOOR_LOCK_CONTROLLER -> "Security"
            
            MATTER_DEVICE_THERMOSTAT,
            MATTER_DEVICE_HEATING_COOLING_UNIT,
            MATTER_DEVICE_FAN,
            MATTER_DEVICE_AIR_PURIFIER -> "Climate"
            
            MATTER_DEVICE_WINDOW_COVERING,
            MATTER_DEVICE_WINDOW_COVERING_CONTROLLER -> "Window Treatments"
            
            MATTER_DEVICE_SPEAKER,
            MATTER_DEVICE_VIDEO_PLAYER,
            MATTER_DEVICE_CASTING_VIDEO_PLAYER -> "Entertainment"
            
            else -> "Other"
        }
    }

    fun supportsDimming(deviceType: Int): Boolean {
        return when (deviceType) {
            MATTER_DEVICE_DIMMABLE_LIGHT,
            MATTER_DEVICE_COLOR_TEMP_LIGHT,
            MATTER_DEVICE_EXTENDED_COLOR_LIGHT,
            MATTER_DEVICE_DIMMER_SWITCH,
            MATTER_DEVICE_COLOR_DIMMER_SWITCH -> true
            else -> false
        }
    }

    fun supportsColor(deviceType: Int): Boolean {
        return when (deviceType) {
            MATTER_DEVICE_COLOR_TEMP_LIGHT,
            MATTER_DEVICE_EXTENDED_COLOR_LIGHT,
            MATTER_DEVICE_COLOR_DIMMER_SWITCH -> true
            else -> false
        }
    }
}
