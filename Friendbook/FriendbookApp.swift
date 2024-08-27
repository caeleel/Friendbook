//
//  FriendbookApp.swift
//  Friendbook
//
//  Created by Karl Jiang on 8/26/24.
//

import SwiftUI

@main
struct FriendbookApp: App {
    let persistenceController = PersistenceController.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.managedObjectContext, persistenceController.container.viewContext)
        }
    }
}
